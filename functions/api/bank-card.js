// functions/api/bank-card.js
// 银行卡开户行BIN查询 - Cloudflare Pages Function
// 数据源：支付宝 ccdcapi.alipay.com（国内开源接口），返回银行代码/卡类型/卡名，另附 Luhn 校验与 BIN 归属判断
// 支持：GET /api/bank-card?card=6222021001113891234
//       POST /api/bank-card  {"card":"6222..."}
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

    try {
        const api = await fetch("https://ccdcapi.alipay.com/validateAndCacheCardInfo.json?cardNo=" + encodeURIComponent(card) + "&cardBinCheck=true", {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", "Referer": "https://ccdcapi.alipay.com/" }
        });
        if (!api.ok) {
            return json(corsHeaders, 502, { success: false, error: "BIN 查询服务暂时不可用（HTTP " + api.status + "），请稍后重试" });
        }
        const d = await api.json();

        const bankCode = (d.bank || "").toUpperCase();
        const bankInfo = BANK_MAP[bankCode] || {};
        const cardType = (d.cardType || "").toUpperCase(); // DC=借记卡 CC=信用卡 SCC=准贷记卡

        const result = {
            success: true,
            input: card,
            masked: maskCard(card),        // 打码显示
            bin: card.slice(0, 6),         // BIN 段
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
            stat: d.stat || ""
        };

        return json(corsHeaders, 200, result);
    } catch (e) {
        return json(corsHeaders, 502, { success: false, error: "查询失败：" + e.message });
    }
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
    "BOCM": { name: "交通银行", short: "交通银行", logo: "COMM" }
};