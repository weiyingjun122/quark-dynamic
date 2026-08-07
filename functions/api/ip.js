// functions/api/ip.js
// IP归属地查询 - 后端代理（ipwho.is），无需本地IP库，免CORS
// 支持：GET /api/ip          -> 返回当前访客IP归属地
//        GET /api/ip?ip=x    -> 查询指定IP归属地
//        POST /api/ip {ip}   -> 同上（JSON 或表单）
export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache"
    };

    // OPTIONS 预检
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // 访客真实 IP（Cloudflare 提供）
    const clientIP = (request.headers.get("CF-Connecting-IP") || "").trim()
        || (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim()
        || (request.headers.get("x-real-ip") || "").trim();

    // 待查询 IP：优先 query 参数，POST 时读 body，都没有则查访客自身 IP
    let queryIP = (url.searchParams.get("ip") || "").trim();

    if (!queryIP && request.method === "POST") {
        try {
            const ct = request.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
                const body = await request.json();
                queryIP = (body.ip || "").trim();
            } else if (ct.includes("application/x-www-form-urlencoded")) {
                const form = await request.formData();
                queryIP = (form.get("ip") || "").trim();
            }
        } catch (e) {
            // 忽略解析失败
        }
    }

    const targetIP = queryIP || clientIP;
    if (!targetIP) {
        return new Response(JSON.stringify({
            success: false,
            error: "未能获取到访客 IP，请传入 ip 参数",
            usage: { self: "/api/ip", query: "/api/ip?ip=8.8.8.8" }
        }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    if (!isPublicIP(targetIP)) {
        return new Response(JSON.stringify({
            success: false,
            error: "IP 不合法或为私网/保留地址，请输入公网 IPv4/IPv6",
            received: targetIP
        }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    try {
        const apiRes = await fetch("https://ipwho.is/" + encodeURIComponent(targetIP), {
            headers: {
                "User-Agent": "quark-dynamic/1.0",
                "Accept": "application/json"
            }
        });
        const data = await apiRes.json();

        if (!data || data.success === false) {
            return new Response(JSON.stringify({
                success: false,
                query: targetIP,
                error: data.message || "查询失败，IP 可能不在数据库中"
            }), {
                status: 404,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            self: !queryIP,           // true 表示查询的是访客自身 IP
            query: targetIP,
            visitor: clientIP || null,
            result: normalizeResult(data)
        }), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    } catch (e) {
        return new Response(JSON.stringify({
            success: false,
            error: "外部 IP 库请求失败，请稍后重试",
            detail: e.message
        }), {
            status: 502,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
}

// 提取易读字段
function normalizeResult(d) {
    return {
        ip: d.ip,
        type: d.type || "",                 // IPv4 / IPv6
        country: d.country || "",
        country_code: d.country_code || "",
        region: d.region || "",
        region_code: d.region_code || "",
        city: d.city || "",
        postal: d.postal || "",
        latitude: d.latitude,
        longitude: d.longitude,
        flag: d.flag ? d.flag.emoji : "",
        connection: {
            isp: (d.connection && d.connection.isp) || "",
            org: (d.connection && d.connection.org) || "",
            asn: (d.connection && d.connection.asn) || "",
            asn_org: (d.connection && d.connection.asn_org) || ""
        },
        timezone: d.timezone ? {
            id: d.timezone.id,
            utc: d.timezone.utc,
            offset_minutes: d.timezone.offset != null ? d.timezone.offset / 60 : null,
            current_time: d.timezone.current_time || computeLocalTime(d.timezone.offset)
        } : null,
        currency: d.currency ? d.currency.code : ""
    };
}

// ipwho.is 部分场景不返回 current_time，按 UTC 偏移自行计算
function computeLocalTime(offsetSeconds) {
    if (typeof offsetSeconds !== "number") return "";
    try {
        const now = new Date(Date.now() + offsetSeconds * 1000);
        const y = now.getUTCFullYear();
        const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
        const d = String(now.getUTCDate()).padStart(2, "0");
        const h = String(now.getUTCHours()).padStart(2, "0");
        const mi = String(now.getUTCMinutes()).padStart(2, "0");
        const s = String(now.getUTCSeconds()).padStart(2, "0");
        return y + "-" + mo + "-" + d + " " + h + ":" + mi + ":" + s;
    } catch (e) {
        return "";
    }
}

// IPv6 校验：标准 8 段十六进制，排除回环/链路本地/ULA/组播/未指定/IPv4映射
function isValidIPv6(ip) {
    if (!/^[0-9a-fA-F:]+$/.test(ip)) return false;
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return false;
    // 至多一个 "::"
    const dd = lower.split("::");
    if (dd.length > 2) return false;
    // 每段最多 4 位十六进制，段数不超 8
    const head = dd[0] ? dd[0].split(":") : [];
    const tail = dd[1] ? dd[1].split(":") : [];
    const all = head.concat(tail);
    if (all.length > 8) return false;
    if (all.some(function (s) { return s.length > 4; })) return false;
    // 首个非空段排除保留前缀
    const first = all[0];
    if (first) {
        if (/^f[cd]/.test(first)) return false;   // fc00::/7 ULA
        if (first.startsWith("fe8") || first.startsWith("fe9") || first.startsWith("fea") || first.startsWith("feb")) return false; // fe80::/10 链路本地
        if (first.startsWith("fec") || first.startsWith("fed") || first.startsWith("fee") || first.startsWith("fef")) return false; // fec0::/10 站点本地
        if (/^ff/.test(first)) return false;      // 组播
        if (first === "2001" && all[1] === "db8") return false; // 文档地址 2001:db8::/32
    }
    return true;
}

// 简单公网 IP 校验（IPv4 + IPv6，排除私网/保留段）
function isPublicIP(ip) {
    if (!ip || typeof ip !== "string") return false;
    ip = ip.trim();
    if (ip.includes(":")) {
        return isValidIPv6(ip);
    }
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const parts = m.slice(1).map(Number);
    if (parts.some(n => n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;      // 0,私网,环回,组播,保留
    if (a === 172 && b >= 16 && b <= 31) return false;   // 私网
    if (a === 192 && b === 168) return false;            // 私网
    if (a === 100 && b >= 64 && b <= 127) return false;  // CGN
    if (a === 169 && b === 254) return false;            // 链路本地
    if (a === 198 && (b === 18 || b === 19)) return false; // doc/test-net
    if (a === 192 && b === 0 && parts[2] === 0) return false; // test-net
    return true;
}