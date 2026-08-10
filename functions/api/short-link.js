// functions/api/short-link.js
// 短链接还原 - Cloudflare Pages Function
// 服务端跟随 301/302/307/308 重定向，返回最终真实 URL 与完整跳转链
// 支持：GET /api/short-link?url=https://xxx
//       POST /api/short-link  {"url":"https://xxx"}
export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache"
    };

    // OPTIONS 预检
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // 解析目标短链
    let shortUrl = (url.searchParams.get("url") || "").trim();
    if (!shortUrl && request.method === "POST") {
        try {
            const ct = request.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
                const body = await request.json();
                shortUrl = (body.url || "").trim();
            } else if (ct.includes("application/x-www-form-urlencoded")) {
                const form = await request.formData();
                shortUrl = (form.get("url") || "").trim();
            }
        } catch (e) {
            // 忽略解析失败
        }
    }

    if (!shortUrl) {
        return json(corsHeaders, 400, { success: false, error: "请传入要还原的短链接 url 参数", usage: { get: "/api/short-link?url=https://short.example/abc", post: '{"url":"https://short.example/abc"}' } });
    }

    // 拼接协议
    if (!/^https?:\/\//i.test(shortUrl)) {
        shortUrl = "https://" + shortUrl;
    }

    let parsed;
    try {
        parsed = new URL(shortUrl);
    } catch (e) {
        return json(corsHeaders, 400, { success: false, error: "链接格式不正确，请输入合法的 http/https 网址", received: shortUrl });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return json(corsHeaders, 400, { success: false, error: "仅支持 http/https 协议的链接", received: shortUrl });
    }

    // 跟随重定向
    const result = await followRedirects(shortUrl);

    return json(corsHeaders, 200, {
        success: true,
        input: shortUrl,
        final: result.final,
        original: result.original,       // 初始原始链接
        redirects: result.redirects,     // 是否发生跳转
        hops: result.hops,               // 每跳明细
        maxHopsReached: result.maxHopsReached,
        error: result.error || null
    });
}

async function followRedirects(startUrl) {
    const hops = [];
    let current = startUrl;
    let maxHopsReached = false;
    const MAX_HOPS = 10;

    for (let i = 0; i < MAX_HOPS; i++) {
        let res;
        try {
            res = await fetchWithTimeout(current);
        } catch (e) {
            hops.push({ url: current, status: null, location: null, error: "请求失败: " + e.message });
            return { final: current, original: startUrl, redirects: hops.length > 1, hops, maxHopsReached, error: e.message };
        }

        if (!res) {
            hops.push({ url: current, status: null, location: null, error: "请求超时或失败" });
            return { final: current, original: startUrl, redirects: hops.length > 1, hops, maxHopsReached, error: "请求超时" };
        }

        const status = res.status;
        const loc = res.headers.get("location");
        hops.push({ url: current, status: status, location: loc || null });

        // 是重定向
        if (status >= 300 && status < 400 && loc && [301, 302, 303, 307, 308].includes(status)) {
            let next;
            try {
                next = new URL(loc, current).href;
            } catch (e) {
                return { final: current, original: startUrl, redirects: hops.length > 1, hops, maxHopsReached, error: "重定向地址解析失败" };
            }
            current = next;
            continue;
        }

        // 非重定向（最终地址）
        return { final: current, original: startUrl, redirects: hops.length > 1, hops, maxHopsReached };
    }

    maxHopsReached = true;
    return { final: current, original: startUrl, redirects: hops.length > 1, hops, maxHopsReached, error: "重定向次数超过" + MAX_HOPS + "次，已停止跟链" };
}

// 带超时的 fetch，拒绝手动重定向跟随（redirect: manual），等待我们自行读取 Location
async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 10000);

    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; ShortLinkResolver/1.0; +https://www.weiyingjun.top/short-link/)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9"
            }
        });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

function json(headers, status, obj) {
    return new Response(JSON.stringify(obj), { status, headers });
}