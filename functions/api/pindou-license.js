// functions/api/pindou-license.js
// 拼豆图纸生成器许可证校验 - Cloudflare Pages Function (只读)
// 前端 GET /api/pindou-license?device_fp=xxx
// 返回服务端记录的许可证 + 服务端当前时间
// 目的: 过期判断以服务端时间为准, 防止用户修改本地系统时钟绕过有效期
// 依赖: D1 绑定 env.DB, 表 pindou_cards

const PLAN_MAP = {
    "1d": { label: "1天卡" },
    "7d": { label: "7天卡" },
    "forever": { label: "永久卡" }
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
        return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }
    if (request.method !== "GET") {
        return jsonRes(405, { success: false, error: "仅支持 GET 请求" });
    }

    if (!env || !env.DB) {
        return jsonRes(503, { success: false, error: "系统未就绪，请稍后再试" });
    }

    const url = new URL(request.url);
    const device_fp = String(url.searchParams.get("device_fp") || "").trim();
    if (!device_fp || device_fp.length < 8) {
        return jsonRes(400, { success: false, error: "设备信息异常，请刷新后重试" });
    }

    try {
        // 取该设备最近一次兑换的许可证
        const row = await env.DB.prepare(
            "SELECT plan, redeemed_at, expires_at FROM pindou_cards WHERE status = 'redeemed' AND device_fp = ? ORDER BY expires_at DESC LIMIT 1"
        ).bind(device_fp).first();

        return jsonRes(200, {
            success: true,
            data: row && row.plan ? {
                valid: true,
                plan: row.plan,
                plan_label: (PLAN_MAP[row.plan] || { label: row.plan }).label,
                expires_at: row.expires_at || null,
                device_fp: device_fp
            } : null,
            server_time: new Date().toISOString()
        });
    } catch (e) {
        return jsonRes(500, { success: false, error: "查询失败，请稍后重试" });
    }
}