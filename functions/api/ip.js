// functions/api/ip.js
// IP归属地查询 - Cloudflare Pages Function
// 多数据源 + 内存缓存 + 自动降级，缓解免费 IP 库限流
// 支持：GET /api/ip            -> 返回当前访客IP归属地
//        GET /api/ip?ip=x     -> 查询指定IP归属地
//        POST /api/ip {ip}    -> 同上（JSON 或表单）
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

    // 访客真实 IP（Cloudflare 提供）
    const clientIP = (request.headers.get("CF-Connecting-IP") || "").trim()
        || (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim()
        || (request.headers.get("x-real-ip") || "").trim();

    // 待查询 IP：优先取参数，没有则查访客自身 IP
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
        return json(corsHeaders, 400, { success: false, error: "未能获取到访客 IP，请传入 ip 参数", usage: { self: "/api/ip", query: "/api/ip?ip=8.8.8.8" } });
    }

    if (!isPublicIP(targetIP)) {
        return json(corsHeaders, 400, { success: false, error: "IP 地址不合法或为私网/保留地址，请输入公网 IPv4/IPv6", received: targetIP });
    }

    // 优先命中内存缓存（去重，缓解上游免费库限流）
    const cached = getCache(targetIP);
    if (cached) {
        return json(corsHeaders, 200, {
            success: true,
            self: !queryIP,
            query: targetIP,
            visitor: clientIP || null,
            cached: true,
            source: cached.source,
            result: cached
        });
    }

    // 自我查询时优先使用 Cloudflare 提供的 request.cf 地理信息（无限流、零外部依赖）
    if (!queryIP) {
        const cf = buildCfGeo(request, clientIP);
        if (cf) {
            setCache(targetIP, cf);
            return json(corsHeaders, 200, {
                success: true,
                self: true,
                query: targetIP,
                visitor: clientIP || null,
                cached: false,
                source: "cloudflare",
                result: cf
            });
        }
    }

    // 主库失败/限流时自动降级
    const raw = await fetchWithFallback(targetIP);

    if (raw && raw.success) {
        setCache(targetIP, raw);
        return json(corsHeaders, 200, {
            success: true,
            self: !queryIP,
            query: targetIP,
            visitor: clientIP || null,
            cached: false,
            source: raw.source,
            result: raw
        });
    }

    return json(corsHeaders, 404, {
        success: false,
        query: targetIP,
        error: (raw && raw.message) || "查询失败，IP 可能不在数据库中"
    });
}

function json(headers, status, obj) {
    return new Response(JSON.stringify(obj), { status, headers });
}

// 用 Cloudflare 提供的 request.cf 地理元数据组装结果（自我查询用，免外部API）
function buildCfGeo(request, clientIP) {
    const cf = request.cf;
    if (!cf || (!cf.country && !cf.city)) return null;
    const countryCode = (cf.country || "").toUpperCase();
    return {
        success: true,
        source: "cloudflare",
        ip: clientIP || "",
        type: clientIP && clientIP.includes(":") ? "IPv6" : "IPv4",
        country: cf.country || "",
        country_code: countryCode,
        region: cf.region || "",
        region_code: (cf.regionCode || cf.__region_code || ""),
        city: cf.city || "",
        postal: cf.postalCode || "",
        latitude: typeof cf.latitude === "number" ? Math.round(cf.latitude * 10000) / 10000 : null,
        longitude: typeof cf.longitude === "number" ? Math.round(cf.longitude * 10000) / 10000 : null,
        flag: countryFlag(countryCode),
        isp: cf.asOrganization || "",
        org: cf.asOrganization || "",
        asn: cf.asn || "",
        timezone: cf.timezone || "",
        utc: "",
        offset_minutes: null,
        current_time: ""
    };
}

/* ============================================================
 * 多数据源抓取（顺序降级）：
 * 1. ipwho.is（主库）
 * 2. ipinfo-like freeipapi（备用）
 * 3. ipapi.co（最后兜底）
 * 每个源加超时保护，防止挂起阻塞后续源
 * ============================================================ */
async function fetchWithFallback(ip) {
    const sources = [fetchIpwho, fetchFreeipapi, fetchIpapiCo];
    for (const fn of sources) {
        try {
            const r = await withTimeout(fn(ip), 6000);
            if (r && r.success) return r;
        } catch (e) {
            // 单个源失败继续下一个
        }
    }
    return null;
}

function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
        let done = false;
        const timer = setTimeout(function () {
            if (!done) { done = true; resolve(null); }
        }, ms);
        promise.then(function (v) {
            if (!done) { done = true; clearTimeout(timer); resolve(v); }
        }).catch(function () {
            if (!done) { done = true; clearTimeout(timer); resolve(null); }
        });
    });
}

async function fetchIpwho(ip) {
    const res = await fetch("https://ipwho.is/" + encodeURIComponent(ip), {
        headers: { "User-Agent": "quark-dynamic/1.0", "Accept": "application/json" }
    });
    if (!res.ok) return { success: false, message: "upstream " + res.status };
    const d = await res.json().catch(() => null);
    if (!d || d.success === false) {
        return { success: false, message: (d && d.message) || "rate limit" };
    }
    const tz = d.timezone || {};
    return {
        success: true,
        source: "ipwho.is",
        ip: d.ip,
        type: d.type || "",
        country: d.country || "",
        country_code: d.country_code || "",
        region: d.region || "",
        region_code: d.region_code || "",
        city: d.city || "",
        postal: d.postal || "",
        latitude: typeof d.latitude === "number" ? Math.round(d.latitude * 10000) / 10000 : d.latitude,
        longitude: typeof d.longitude === "number" ? Math.round(d.longitude * 10000) / 10000 : d.longitude,
        flag: (d.flag && d.flag.emoji) || "",
        isp: (d.connection && d.connection.isp) || "",
        org: (d.connection && d.connection.org) || "",
        asn: (d.connection && d.connection.asn) || "",
        timezone: tz.id || "",
        utc: tz.utc || "",
        offset_minutes: tz.offset != null ? Math.round(tz.offset / 60) : null,
        current_time: tz.current_time || computeLocalTime(tz.offset)
    };
}

async function fetchIpapiCo(ip) {
    const res = await fetch("https://ipapi.co/" + encodeURIComponent(ip) + "/json/", {
        headers: { "User-Agent": "quark-dynamic/1.0", "Accept": "application/json" }
    });
    if (!res.ok) return { success: false, message: "upstream " + res.status };
    const d = await res.json().catch(() => null);
    if (!d || d.error || !d.country_name) {
        return { success: false, message: (d && d.reason) || "not found" };
    }
    const tz = d.timezone || "";
    return {
        success: true,
        source: "ipapi.co",
        ip: d.ip,
        type: "IPv4",
        country: d.country_name || "",
        country_code: d.country_code || "",
        region: d.region || "",
        region_code: d.region_code || "",
        city: d.city || "",
        postal: d.postal || "",
        latitude: d.latitude,
        longitude: d.longitude,
        flag: countryFlag(d.country_code),
        connection: d.org || "",
        org: d.org || "",
        asn: "",
        timezone: tz,
        utc: "",
        offset_minutes: null,
        current_time: ""
    };
}

async function fetchFreeipapi(ip) {
    const res = await fetch("https://freeipapi.com/api/json/" + encodeURIComponent(ip), {
        headers: { "User-Agent": "quark-dynamic/1.0", "Accept": "application/json" }
    });
    if (!res.ok) return { success: false, message: "upstream " + res.status };
    const d = await res.json().catch(() => null);
    if (!d || d.statusCode || !d.countryName) {
        return { success: false, message: "not found" };
    }
    const tz = d.timeZone || "";
    return {
        success: true,
        source: "freeipapi",
        ip: ip,
        type: d.ipVersion && d.ipVersion === 6 ? "IPv6" : "IPv4",
        country: d.countryName || "",
        country_code: d.countryCode || "",
region: d.regionName || "",
        region_code: d.regionCode || "",
        city: d.cityName || "",
        postal: d.zipCode || "",
        latitude: d.latitude,
        longitude: d.longitude,
        flag: countryFlag(d.countryCode),
        connection: d.isp || "",
        isp: d.isp || "",
        asn: (d.asn && d.asn !== 0) ? d.asn : "",
        timezone: tz,
        utc: "",
        offset_minutes: null,
        current_time: ""
    };
}

/* ============================================================
 * 内存缓存：Worker 实例内短时缓存，避免同一 IP 重复打上游
 * TTL 10 分钟
 * ============================================================ */
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function getCache(ip) {
    const item = cache.get(ip);
    if (item && Date.now() - item.t < CACHE_TTL) return item.api;
    if (item) cache.delete(ip);
    return null;
}

function setCache(ip, data) {
    if (cache.size > 500) cache.clear();
    cache.set(ip, { t: Date.now(), api: data });
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

// ISO 3166 两字母国家码 -> 国旗 emoji
const FLAG_OFFSET = 127397; // 0x1F1A5
function countryFlag(cc) {
    if (!cc || typeof cc !== "string") return "";
    const upper = cc.toUpperCase();
    if (upper.length !== 2) return "";
    let s = "";
    for (const ch of upper) {
        const code = ch.charCodeAt(0) + FLAG_OFFSET;
        if (code < 0x1f1e6 || code > 0x1f1ff) return "";
        s += String.fromCodePoint(code);
    }
    return s;
}

/* ============================================================
 * IPv6 校验：标准 8 段十六进制，排除回环/链路本地/ULA/组播/未指定
 * ============================================================ */
function isValidIPv6(ip) {
    if (!/^[0-9a-fA-F:]+$/.test(ip)) return false;
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return false;
    const dd = lower.split("::");
    if (dd.length > 2) return false;
    const head = dd[0] ? dd[0].split(":") : [];
    const tail = dd[1] ? dd[1].split(":") : [];
    const all = head.concat(tail);
    if (all.length > 8) return false;
    if (all.some(function (s) { return s.length > 4; })) return false;
    const first = all[0];
    if (first) {
        if (/^f[cd]/.test(first)) return false;   // ULA
        if (/^fe[89ab]/.test(first)) return false;   // 链路本地
        if (/^fec[def]/.test(first)) return false;   // 站点本地
        if (/^ff/.test(first)) return false;         // 组播
        if (first === "2001" && all[1] === "db8") return false; // 文档地址
    }
    return true;
}

// 公网 IP 校验（IPv4 + IPv6，排除私网/保留段）
function isPublicIP(ip) {
    if (!ip || typeof ip !== "string") return false;
    ip = ip.trim();
    if (ip.includes(":")) return isValidIPv6(ip);
    const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const parts = m.slice(1).map(Number);
    if (parts.some(n => n < 0 || n > 255)) return false;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 192 && b === 0 && parts[2] === 0) return false;
    return true;
}