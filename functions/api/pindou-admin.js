// functions/api/pindou-admin.js
// 拼豆图纸生成器卡密管理接口 (需管理员令牌)
// 环境变量: PINDOU_ADMIN_TOKEN (Cloudflare Pages -> Settings -> Environment variables -> Production)
// 前端: pindou/admin.html, 所有请求带 Authorization: Bearer <token>
// 依赖: D1 绑定 env.DB, 表 pindou_cards (见 scripts/pindou_schema.sql)

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
    });

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    }
    if (request.method !== "POST") {
        return jsonRes(405, { success: false, error: "仅支持 POST 请求" });
    }
    if (!env || !env.DB) {
        return jsonRes(503, { success: false, error: "卡密系统未就绪" });
    }

    const adminToken = env.PINDOU_ADMIN_TOKEN || "";
    if (!adminToken) {
        return jsonRes(503, { success: false, error: "管理员令牌未配置 (PINDOU_ADMIN_TOKEN)" });
    }
    const auth = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!auth || auth !== adminToken) {
        return jsonRes(403, { success: false, error: "管理员令牌无效" });
    }

    let body = {};
    try { body = await request.json(); } catch (e) { return jsonRes(400, { success: false, error: "请求格式错误" }); }

    const action = String(body.action || "").trim();
    try {
        switch (action) {
            case "stats": return jsonRes(200, { success: true, ...(await computeStats(env)) });
            case "query": return jsonRes(200, { success: true, ...(await queryCard(env, body.code)) });
            case "list": return jsonRes(200, { success: true, ...(await runList(env, body)) });
            case "add": return jsonRes(200, { success: true, ...(await addCards(env, body)) });
            case "extend": return jsonRes(200, { success: true, ...(await extendCard(env, body)) });
            case "reset": return jsonRes(200, { success: true, ...(await resetCard(env, body)) });
            case "rebind": return jsonRes(200, { success: true, ...(await rebindCard(env, body)) });
            case "setplan": return jsonRes(200, { success: true, ...(await setPlan(env, body)) });
            case "delete": return jsonRes(200, { success: true, ...(await deleteCard(env, body)) });
            default: return jsonRes(400, { success: false, error: "未知操作: " + action });
        }
    } catch (e) {
        return jsonRes(500, { success: false, error: "操作失败: " + (e.message || e) });
    }
}

function normCode(raw) {
    const c = String(raw || "").trim().toUpperCase().replace(/[\s\-]/g, "");
    if (!/^[A-HJ-NP-Z2-9]{14}$/.test(c)) throw new Error("卡密格式不正确");
    return c;
}

function enrich(row) {
    if (!row) return row;
    let label;
    const now = Date.now();
    if (row.status === "available") label = "未使用";
    else if (!row.expires_at) label = "永久生效";
    else if (new Date(row.expires_at).getTime() > now) label = "生效中";
    else label = "已过期";
    return Object.assign({}, row, { label });
}

async function queryCard(env, raw) {
    const code = normCode(raw);
    const row = await env.DB.prepare(
        "SELECT code, plan, status, device_fp, redeemed_at, expires_at FROM pindou_cards WHERE code = ?"
    ).bind(code).first();
    return { card: enrich(row || null) };
}

async function computeStats(env) {
    const now = new Date().toISOString();
    const grp = (await env.DB.prepare("SELECT status, plan, COUNT(*) c FROM pindou_cards GROUP BY status, plan").all()).results || [];
    const active = (await env.DB.prepare("SELECT COUNT(*) c FROM pindou_cards WHERE status='redeemed' AND (expires_at IS NULL OR expires_at > ?)").bind(now).first()).c;
    const expired = (await env.DB.prepare("SELECT COUNT(*) c FROM pindou_cards WHERE status='redeemed' AND expires_at IS NOT NULL AND expires_at <= ?").bind(now).first()).c;
    const stats = { total: 0, available: 0, redeemed: 0, active: active, expired: expired, byPlan: {}, byStatus: {} };
    grp.forEach(function (g) {
        stats.total += g.c;
        stats.byPlan[g.plan] = (stats.byPlan[g.plan] || 0) + g.c;
        stats.byStatus[g.status] = (stats.byStatus[g.status] || 0) + g.c;
    });
    stats.available = stats.byStatus.available || 0;
    stats.redeemed = stats.byStatus.redeemed || 0;
    return { stats: stats };
}

async function runList(env, body) {
    const where = [], args = [];
    if (body.search) { where.push("code LIKE ?"); args.push("%" + String(body.search).toUpperCase() + "%"); }
    if (body.status && body.status !== "all") { where.push("status = ?"); args.push(String(body.status)); }
    if (body.plan && body.plan !== "all") { where.push("plan = ?"); args.push(String(body.plan)); }
    const w = where.length ? " WHERE " + where.join(" AND ") : "";
    const page = Math.max(1, parseInt(body.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(body.pageSize, 10) || 20));
    const total = (await env.DB.prepare("SELECT COUNT(*) c FROM pindou_cards" + w).bind(...args).first()).c;
    const rows = (await env.DB.prepare(
        "SELECT code, plan, status, device_fp, redeemed_at, expires_at FROM pindou_cards" + w +
        " ORDER BY redeemed_at DESC, code LIMIT ? OFFSET ?"
    ).bind(...args, pageSize, (page - 1) * pageSize).all()).results || [];
    return { cards: rows.map(enrich), total: total, page: page, pageSize: pageSize, stats: (await computeStats(env)).stats };
}

async function addCards(env, body) {
    const plan = String(body.plan || "").trim();
    if (!PLAN_MAP[plan]) throw new Error("卡类型必须是 1d/7d/forever");
    let codes = [];
    if (Array.isArray(body.codes)) {
        codes = body.codes.map(normCode);
    } else {
        const count = parseInt(body.count, 10) || 0;
        if (count < 1 || count > 200) throw new Error("数量需在 1-200 之间");
        const existing = new Set((await env.DB.prepare("SELECT code FROM pindou_cards").all()).results.map(function (r) { return r.code; }));
        const buf = new Uint8Array(14);
        while (codes.length < count) {
            crypto.getRandomValues(buf);
            let c = "";
            for (let i = 0; i < 14; i++) c += ALPHABET[buf[i] % ALPHABET.length];
            if (!existing.has(c) && codes.indexOf(c) === -1) { existing.add(c); codes.push(c); }
        }
    }
    const stmts = codes.map(function (c) {
        return env.DB.prepare("INSERT OR IGNORE INTO pindou_cards (code, plan) VALUES (?, ?)").bind(c, plan);
    });
    const res = await env.DB.batch(stmts);
    const inserted = res.reduce(function (n, r) { return n + ((r && r.meta && r.meta.changes) || 0); }, 0);
    return { inserted: inserted, duplicates: codes.length - inserted };
}

async function extendCard(env, body) {
    const code = normCode(body.code);
    const days = parseInt(body.days, 10);
    if (!(days >= 1 && days <= 3650)) throw new Error("天数需在 1-3650 之间");
    const row = await env.DB.prepare("SELECT expires_at FROM pindou_cards WHERE code = ?").bind(code).first();
    if (!row) throw new Error("卡密不存在");
    let base = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (!(base > Date.now())) base = Date.now();
    const next = new Date(base + days * 86400000).toISOString();
    const r = await env.DB.prepare("UPDATE pindou_cards SET expires_at = ? WHERE code = ?").bind(next, code).run();
    if (!(r.meta.changes > 0)) throw new Error("卡密不存在");
    return { expires_at: next };
}

async function resetCard(env, body) {
    const code = normCode(body.code);
    const r = await env.DB.prepare(
        "UPDATE pindou_cards SET status='available', device_fp=NULL, redeemed_at=NULL, expires_at=NULL WHERE code = ?"
    ).bind(code).run();
    if (!(r.meta.changes > 0)) throw new Error("卡密不存在");
    return { ok: true };
}

async function rebindCard(env, body) {
    const code = normCode(body.code);
    const fp = String(body.device_fp || "").trim();
    if (fp.length < 8) throw new Error("设备指纹异常");
    const row = await env.DB.prepare("SELECT status FROM pindou_cards WHERE code = ?").bind(code).first();
    if (!row) throw new Error("卡密不存在");
    if (row.status !== "redeemed") throw new Error("仅已兑换卡密可换绑");
    const r = await env.DB.prepare("UPDATE pindou_cards SET device_fp = ? WHERE code = ?").bind(fp, code).run();
    if (!(r.meta.changes > 0)) throw new Error("卡密不存在");
    return { ok: true };
}

async function setPlan(env, body) {
    const code = normCode(body.code);
    const plan = String(body.plan || "").trim();
    if (!PLAN_MAP[plan]) throw new Error("卡类型必须是 1d/7d/forever");
    const row = await env.DB.prepare("SELECT status, expires_at FROM pindou_cards WHERE code = ?").bind(code).first();
    if (!row) throw new Error("卡密不存在");
    let next = null;
    if (PLAN_MAP[plan].hours && row.status === "redeemed" && !row.expires_at) {
        next = new Date(Date.now() + PLAN_MAP[plan].hours * 3600 * 1000).toISOString();
    }
    const r = next
        ? await env.DB.prepare("UPDATE pindou_cards SET plan = ?, expires_at = ? WHERE code = ?").bind(plan, next, code).run()
        : await env.DB.prepare("UPDATE pindou_cards SET plan = ? WHERE code = ?").bind(plan, code).run();
    if (!(r.meta.changes > 0)) throw new Error("卡密不存在");
    return { ok: true, expires_at: next };
}

async function deleteCard(env, body) {
    const code = normCode(body.code);
    const r = await env.DB.prepare("DELETE FROM pindou_cards WHERE code = ?").bind(code).run();
    if (!(r.meta.changes > 0)) throw new Error("卡密不存在");
    return { ok: true };
}
