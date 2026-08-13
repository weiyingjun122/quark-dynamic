// functions/api/pindou-redeem.js
// 拼豆图纸生成器卡密兑换 - Cloudflare Pages Function
// 依赖: D1 数据库绑定 env.DB, 表 pindou_cards (见 scripts/pindou_schema.sql)
// 前端 POST /api/pindou-redeem  {"code":"...","device_fp":"..."}
// 返回 license: { valid, plan, plan_label, expires_at, device_fp }
// 若 D1 未绑定(env.DB 不存在), 返回明确错误, 不影响其他功能

const PLAN_MAP = {
    "1d": { hours: 24, label: "1天卡" },
    "7d": { hours: 168, label: "7天卡" },
    "forever": { hours: null, label: "永久卡" }
};

export async function onRequest(context) {
    const { request, env } = context;

    const jsonRes = (status, obj) => new Response(JSON.stringify(obj), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Access-Control-Allow-Origin": "*"
        }
    });

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }
    if (request.method !== "POST") {
        return jsonRes(405, { success: false, error: "仅支持 POST 请求" });
    }

    if (!env || !env.DB) {
        return jsonRes(503, { success: false, error: "卡密系统暂未开放，请稍后再试" });
    }

    let code = "", device_fp = "";
    try {
        const body = await request.json();
        code = String(body.code || "").trim();
        device_fp = String(body.device_fp || "").trim();
    } catch (e) {
        return jsonRes(400, { success: false, error: "请求格式错误" });
    }

    // 卡密清洗: 大写 + 去空格/连字符
    code = code.toUpperCase().replace(/[\s\-]/g, "");
    // 14位, 仅 A-H J-N P-Z 与 2-9 (剔除 0/O/1/I 易混淆字符)
    if (!/^[A-HJ-NP-Z2-9]{14}$/.test(code)) {
        return jsonRes(400, { success: false, error: "卡密格式不正确" });
    }
    if (!device_fp || device_fp.length < 8) {
        return jsonRes(400, { success: false, error: "设备信息异常，请刷新后重试" });
    }

    try {
        // 原子占用: 仅当卡密可用时更新为已兑换, 避免并发重复兑换
        const now = new Date().toISOString();
        const bind = await env.DB.prepare(
            "SELECT plan, status, device_fp, redeemed_at, expires_at FROM pindou_cards WHERE code = ?"
        ).bind(code).first();

        if (!bind) {
            return jsonRes(404, { success: false, error: "卡密不存在，请检查后重试" });
        }

        if (bind.status === "redeemed") {
            if (bind.device_fp === device_fp) {
                return jsonRes(200, { success: true, data: licenseOf(bind) });
            }
            return jsonRes(409, { success: false, error: "卡密已被其他设备使用" });
        }

        const plan = PLAN_MAP[bind.plan];
        if (!plan) {
            return jsonRes(500, { success: false, error: "卡密类型异常，请稍后再试" });
        }

        // 尝试原子领取: 若已被其他请求抢先兑换, changes 为 0
        const updateSql = "UPDATE pindou_cards SET status = 'redeemed', device_fp = ?, redeemed_at = ?, expires_at = ? WHERE code = ? AND status = 'available'";
        const args = plan.hours
            ? [device_fp, now, new Date(Date.now() + plan.hours * 3600 * 1000).toISOString(), code]
            : [device_fp, now, null, code];
        const res = await env.DB.prepare(updateSql).bind(...args).run();

        if (res && res.meta && res.meta.changes === 0) {
            return jsonRes(409, { success: false, error: "卡密已被使用" });
        }

        const fresh = await env.DB.prepare(
            "SELECT plan, status, device_fp, redeemed_at, expires_at FROM pindou_cards WHERE code = ?"
        ).bind(code).first();

        return jsonRes(200, { success: true, data: licenseOf(fresh) });
    } catch (e) {
        return jsonRes(500, { success: false, error: "服务器繁忙，请稍后重试" });
    }
}

function licenseOf(row) {
    const plan = PLAN_MAP[row.plan] || { label: row.plan };
    return {
        valid: true,
        plan: row.plan,
        plan_label: plan.label,
        expires_at: row.expires_at || null,
        device_fp: row.device_fp
    };
}