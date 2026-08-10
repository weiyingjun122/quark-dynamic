// functions/api/bank-card.js
// 银行卡开户行BIN查询 - Cloudflare Pages Function
// 主数据源：支付宝 ccdcapi.alipay.com（国内开源接口），返回银行代码/卡类型/卡名
// 兜底方案：本地内置主流银行卡 BIN 前缀库（alipay 不可达/超时时使用）
// 支持：GET /api/bank-card?card=6222021001113891234
//       POST /api/bank-card  {"card":"6222..."}

const UPSTREAM_TIMEOUT_MS = 2500; // 上游接口超时时间（快进快出，超时走本地 BIN 兜底）

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

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    let card = (url.searchParams.get("card") || "").trim();
    if (!card && request.method === "POST") {
        try {
            const ct = request.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
                const body = await request.json();
                card = (body.card || "").trim();
            } else if (ct.includes("application/x-www-form-urlencoded")) {
                const form = await request.formData();
                card = (form.get("card") || "").trim();
            }
        } catch (e) { /* 忽略解析失败 */ }
    }

    if (!card) {
        return json(corsHeaders, 400, { success: false, error: "请输入要查询的银行卡号", usage: { get: "/api/bank-card?card=6222021001113891234", post: '{"card":"6222021001113891234"}' } });
    }

    // 卡号清洗：只保留数字
    card = card.replace(/\s+/g, "").replace(/-/g, "");
    if (!/^\d{12,19}$/.test(card)) {
        return json(corsHeaders, 400, { success: false, error: "银行卡号格式不正确，请输入 12-19 位数字（建议至少卡号前 12 位，保护隐私）", received: card });
    }

    // Luhn 校验（完整卡可校验，前12位无法校验则跳过）
    const luhnValid = card.length >= 16 ? luhnCheck(card) : null;

    // 1) 先尝试支付宝 BIN 接口（带超时，避免挂起导致 Cloudflare 502）
    let result = null;
    let source = "";
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
        let resp;
        try {
            resp = await fetch(
                "https://ccdcapi.alipay.com/validateAndCacheCardInfo.json?cardNo=" + encodeURIComponent(card) + "&cardBinCheck=true",
                {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
                        "Referer": "https://ccdcapi.alipay.com/"
                    },
                    signal: controller.signal
                }
            );
        } finally {
            clearTimeout(timer);
        }

        if (resp && resp.ok) {
            const d = await resp.json();
            const bankCode = (d.bank || "").toUpperCase();
            const bankInfo = BANK_MAP[bankCode] || {};
            const cardType = (d.cardType || "").toUpperCase();
            result = {
                success: true,
                input: card,
                masked: maskCard(card),
                bin: card.slice(0, 6),
                length: card.length,
                bank: {
                    code: bankCode,
                    name: bankInfo.name || "未知银行",
                    short: bankInfo.short || "",
                    logo: bankInfo.logo || "",
                    type: cardType,
                    typeName: cardTypeName(cardType)
                },
                validated: d.validated === true,
                validated_msg: d.messages && d.messages.length ? d.messages.join("; ") : "",
                luhn: luhnValid,
                luhn_msg: luhnValid === null ? "卡号不足16位，未执行 Luhn 算法校验" : (luhnValid ? "卡号校验通过" : "卡号校验未通过（非有效卡号）"),
                stat: d.stat || "",
                source: "alipay"
            };
        }
    } catch (e) {
        // 上游不可达/超时，走本地 BIN 库兜底
        result = null;
    }

    // 2) 兜底：本地 BIN 前缀库
    if (!result) {
        const binMap = matchBin(card);
        if (binMap) {
            const cardType = binMap.type || "DC";
            result = {
                success: true,
                input: card,
                masked: maskCard(card),
                bin: card.slice(0, 6),
                length: card.length,
                bank: {
                    code: binMap.code,
                    name: binMap.name,
                    short: binMap.short,
                    logo: binMap.code,
                    type: cardType,
                    typeName: cardTypeName(cardType)
                },
                validated: null,
                validated_msg: "",
                luhn: luhnValid,
                luhn_msg: luhnValid === null ? "卡号不足16位，未执行 Luhn 算法校验" : (luhnValid ? "卡号校验通过" : "卡号校验未通过（非有效卡号）"),
                stat: "",
                source: "local-bin",
                note: "上游接口暂时不可用，本次结果由本地 BIN 库匹配，仅供参考"
            };
        } else {
            return json(corsHeaders, 502, { success: false, error: "BIN 查询服务暂时不可用，且本地库未匹配到该卡号，请稍后重试", received: card });
        }
    }

    return json(corsHeaders, 200, result);
}

function json(headers, status, obj) {
    return new Response(JSON.stringify(obj), { status, headers });
}

// Luhn 算法校验银行卡号
function luhnCheck(num) {
    let sum = 0;
    let dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
        let d = num.charCodeAt(i) - 48;
        if (dbl) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        sum += d;
        dbl = !dbl;
    }
    return sum % 10 === 0;
}

function cardTypeName(t) {
    switch (t) {
        case "DC": return "借记卡";
        case "CC": return "信用卡";
        case "SCC": return "准贷记卡";
        case "PC": return "预付卡";
        default: return "银行卡";
    }
}

function maskCard(card) {
    if (card.length < 8) return card;
    return card.slice(0, 4) + " **** **** " + card.slice(-4);
}

/* ============================================================
 * 本地 BIN 前缀库（兜底用）
 * key: 卡号前 6 位（也兼容仅前 4 位命中，当作一组前缀）
 * ============================================================ */
const BIN_PREFIXES = [
    // 工商银行 ICBC
    ["622202", "ICBC", "DC"], ["622203", "ICBC", "DC"], ["622225", "ICBC", "DC"],
    ["621225", "ICBC", "DC"], ["621226", "ICBC", "DC"], ["621227", "ICBC", "DC"],
    ["621281", "ICBC", "DC"], ["621288", "ICBC", "DC"], ["621558", "ICBC", "DC"],
    ["621559", "ICBC", "DC"], ["621560", "ICBC", "DC"], ["621722", "ICBC", "DC"],
    ["622230", "ICBC", "DC"], ["621723", "ICBC", "DC"], ["622210", "ICBC", "DC"],
    ["622211", "ICBC", "DC"], ["622212", "ICBC", "DC"], ["622213", "ICBC", "DC"],
    ["622214", "ICBC", "DC"], ["622215", "ICBC", "DC"], ["622215", "ICBC", "DC"],
    ["622216", "ICBC", "DC"], ["622217", "ICBC", "DC"], ["622218", "ICBC", "DC"],
    ["622219", "ICBC", "DC"], ["622220", "ICBC", "DC"], ["622221", "ICBC", "DC"],
    ["622222", "ICBC", "DC"], ["622223", "ICBC", "DC"], ["622224", "ICBC", "DC"],
    ["622226", "ICBC", "DC"], ["622227", "ICBC", "DC"], ["622228", "ICBC", "DC"],
    ["622229", "ICBC", "DC"], ["621701", "ICBC", "DC"], ["621702", "ICBC", "DC"],
    // 农业银行 ABC
    ["622848", "ABC", "DC"], ["622849", "ABC", "DC"], ["621336", "ABC", "DC"],
    ["621337", "ABC", "DC"], ["621338", "ABC", "DC"], ["621339", "ABC", "DC"],
    ["622828", "ABC", "DC"], ["622841", "ABC", "DC"],
    ["622843", "ABC", "DC"], ["622845", "ABC", "DC"],
    // 中国银行 BOC
    ["621660", "BOC", "DC"], ["621661", "BOC", "DC"], ["621662", "BOC", "DC"],
    ["621663", "BOC", "DC"], ["621665", "BOC", "DC"], ["621666", "BOC", "DC"],
    ["621667", "BOC", "DC"], ["621668", "BOC", "DC"], ["621669", "BOC", "DC"],
    ["621670", "BOC", "DC"], ["621671", "BOC", "DC"], ["621672", "BOC", "DC"],
    ["621673", "BOC", "DC"], ["622760", "BOC", "DC"], ["622761", "BOC", "DC"],
    // 建设银行 CCB
    ["621700", "CCB", "DC"], ["622700", "CCB", "DC"], ["621466", "CCB", "DC"],
    ["621467", "CCB", "DC"], ["621468", "CCB", "DC"], ["621469", "CCB", "DC"],
    ["621081", "CCB", "DC"], ["621082", "CCB", "DC"], ["621083", "CCB", "DC"],
    ["620058", "CCB", "DC"], ["622280", "CCB", "DC"], ["622281", "CCB", "DC"],
    ["622282", "CCB", "DC"], ["622283", "CCB", "DC"],
    // 交通银行 COMM
    ["622258", "COMM", "DC"], ["622259", "COMM", "DC"], ["621962", "COMM", "DC"],
    ["621963", "COMM", "DC"], ["622260", "COMM", "DC"],
    // 招商银行 CMB
    ["622588", "CMB", "DC"], ["622575", "CMB", "DC"], ["622576", "CMB", "DC"],
    ["621483", "CMB", "DC"], ["621484", "CMB", "DC"], ["621485", "CMB", "DC"],
    ["621599", "CMB", "DC"], ["621602", "CMB", "DC"],
    // 浦发银行 SPDB
    ["622521", "SPDB", "DC"], ["622522", "SPDB", "DC"], ["621793", "SPDB", "DC"],
    ["621794", "SPDB", "DC"], ["622670", "SPDB", "DC"],
    // 兴业银行 CIB
    ["622908", "CIB", "DC"], ["622901", "CIB", "DC"], ["622902", "CIB", "DC"],
    ["622910", "CIB", "DC"], ["621319", "CIB", "DC"],
    // 光大银行 CEB
    ["622668", "CEB", "DC"], ["622669", "CEB", "DC"], ["622660", "CEB", "DC"],
    ["621030", "CEB", "DC"],
    // 华夏银行 HXB
    ["622636", "HXB", "DC"], ["622630", "HXB", "DC"], ["622639", "HXB", "DC"],
    ["621515", "HXB", "DC"],
    // 民生银行 CMBC
    ["622622", "CMBC", "DC"], ["622623", "CMBC", "DC"], ["621691", "CMBC", "DC"],
    ["621692", "CMBC", "DC"], ["621370", "CMBC", "DC"],
    // 中信银行 CITIC
    ["622690", "CITIC", "DC"], ["622691", "CITIC", "DC"], ["622692", "CITIC", "DC"],
    ["621768", "CITIC", "DC"], ["621771", "CITIC", "DC"],
    // 平安银行 PAB
    ["622155", "PAB", "DC"], ["622156", "PAB", "DC"], ["621626", "PAB", "DC"],
    ["622635", "PAB", "DC"], ["621761", "PAB", "DC"],
    // 广发银行 CGB
    ["622568", "CGB", "DC"], ["621462", "CGB", "DC"], ["621463", "CGB", "DC"],
    // 邮储银行 PSBC
    ["622188", "PSBC", "DC"], ["621797", "PSBC", "DC"], ["621798", "PSBC", "DC"],
    ["621799", "PSBC", "DC"], ["622150", "PSBC", "DC"], ["622151", "PSBC", "DC"],
    ["621095", "PSBC", "DC"], ["620062", "PSBC", "DC"],
    // 银行代码 -> 名称表
];

function matchBin(card) {
    const bin6 = card.slice(0, 6);
    for (let i = 0; i < BIN_PREFIXES.length; i++) {
        if (BIN_PREFIXES[i][0] === bin6) {
            const code = BIN_PREFIXES[i][1];
            const info = BANK_MAP[code] || { name: code, short: code };
            return { code, name: info.name, short: info.short, type: BIN_PREFIXES[i][2] };
        }
    }
    return null;
}

/* ============================================================
 * 银行代码 -> 中文名 / 缩写 / 图标标识
 * 覆盖支付宝接口常见返回的 bank 代码
 * ============================================================ */
const BANK_MAP = {
    "ICBC": { name: "中国工商银行", short: "工商银行", logo: "ICBC" },
    "ABC": { name: "中国农业银行", short: "农业银行", logo: "ABC" },
    "BOC": { name: "中国银行", short: "中国银行", logo: "BOC" },
    "CCB": { name: "中国建设银行", short: "建设银行", logo: "CCB" },
    "COMM": { name: "交通银行", short: "交通银行", logo: "COMM" },
    "BOCOM": { name: "交通银行", short: "交通银行", logo: "COMM" },
    "CMB": { name: "招商银行", short: "招商银行", logo: "CMB" },
    "CIB": { name: "兴业银行", short: "兴业银行", logo: "CIB" },
    "SPDB": { name: "上海浦东发展银行", short: "浦发银行", logo: "SPDB" },
    "CEB": { name: "中国光大银行", short: "光大银行", logo: "CEB" },
    "HXB": { name: "华夏银行", short: "华夏银行", logo: "HXB" },
    "GDB": { name: "广东发展银行", short: "广发银行", logo: "GDB" },
    "CGB": { name: "广发银行", short: "广发银行", logo: "GDB" },
    "CMBC": { name: "中国民生银行", short: "民生银行", logo: "CMBC" },
    "CITIC": { name: "中信银行", short: "中信银行", logo: "CITIC" },
    "ECITIC": { name: "中信银行", short: "中信银行", logo: "CITIC" },
    "PINGAN": { name: "平安银行", short: "平安银行", logo: "PAB" },
    "PAB": { name: "平安银行", short: "平安银行", logo: "PAB" },
    "HXBANK": { name: "徽商银行", short: "徽商银行", logo: "HSBANK" },
    "BOS": { name: "上海银行", short: "上海银行", logo: "BOS" },
    "JSBANK": { name: "江苏银行", short: "江苏银行", logo: "JSBANK" },
    "BEA": { name: "东亚银行", short: "东亚银行", logo: "BEA" },
    "BCCB": { name: "北京银行", short: "北京银行", logo: "BCCB" },
    "BOSH": { name: "上海银行", short: "上海银行", logo: "BOS" },
    "BON": { name: "南京银行", short: "南京银行", logo: "NJCB" },
    "NJCB": { name: "南京银行", short: "南京银行", logo: "NJCB" },
    "BSB": { name: "包商银行", short: "包商银行", logo: "BSB" },
    "SDB": { name: "深圳发展银行", short: "深发展银行", logo: "SDB" },
    "HZCB": { name: "杭州银行", short: "杭州银行", logo: "HZCB" },
    "NECT": { name: "上海农商银行", short: "上海农商行", logo: "SRCB" },
    "SRCB": { name: "上海农村商业银行", short: "上海农商行", logo: "SRCB" },
    "NBCB": { name: "宁波银行", short: "宁波银行", logo: "NBCB" },
    "GZCB": { name: "广州银行", short: "广州银行", logo: "GZCB" },
    "ZZBANK": { name: "郑州银行", short: "郑州银行", logo: "ZZBANK" },
    "CDB": { name: "国家开发银行", short: "国家开发银行", logo: "CDB" },
    "BOCM": { name: "交通银行", short: "交通银行", logo: "COMM" },
    "PSBC": { name: "中国邮政储蓄银行", short: "邮储银行", logo: "PSBC" },
    "PSB": { name: "中国邮政储蓄银行", short: "邮储银行", logo: "PSBC" }
};