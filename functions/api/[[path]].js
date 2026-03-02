// functions/api/[[path]].js
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);

    // 只处理 /api/ 开头的请求
    if (pathSegments[0] !== 'api') {
        return new Response('Not Found', { status: 404 });
    }

    // CORS 配置
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Device-ID",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin, Accept-Encoding",
        "Security-Header": "api-request"
    };

    // 处理 OPTIONS 预检请求
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const action = pathSegments[1]; // record, hot, sync, debug, health, gap
    const subAction = pathSegments[2]; // for auth: register, login, transfer, logout

    // 用户认证路由
    if (action === 'auth') {
        switch (subAction) {
            case 'register':
                return await handleAuthRegister(request, env, corsHeaders);
            case 'login':
                return await handleAuthLogin(request, env, corsHeaders);
            case 'transfer':
                return await handleTransfer(request, env, corsHeaders);
            case 'status':
                return await handleTransferStatus(request, env, corsHeaders);
            case 'check':
                return await handleCheckView(request, env, corsHeaders);
            case 'logout':
                return await handleLogout(request, env, corsHeaders);
            default:
                return new Response(JSON.stringify({
                    error: "Auth endpoint not found",
                    available: ["/api/auth/register", "/api/auth/login", "/api/auth/transfer", "/api/auth/status", "/api/auth/check", "/api/auth/logout"]
                }), {
                    status: 404,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
        }
    }

    // 路由到不同的处理函数
    switch (action) {
        case 'record':
            return await handleRecord(request, env, url, corsHeaders);
        case 'hot':
            return await handleHot(env, corsHeaders);
        case 'hot-by-type':
            return await handleHotByType(request, env, corsHeaders);
        case 'sync':
            return await handleSync(request, env, url, corsHeaders);
        case 'gap':
            return await handleGap(env, corsHeaders);
        case 'debug':
            return await handleDebug(request, env, corsHeaders);
        case 'health':
            return await handleHealth(corsHeaders);
        case 'ping':
            return await handlePing(corsHeaders);
        case 'request':
            return await handleRequest(request, env, corsHeaders);
        case 'clear-stats':
            return await handleClearStats(request, env, corsHeaders);
        case 'set-stats':
            return await handleSetStats(request, env, corsHeaders);
        case 'del-stat':
            return await handleDelStat(request, env, corsHeaders);
        case 'ip-whitelist':
            return await handleIpWhitelist(request, env, corsHeaders);
        default:
            return new Response(JSON.stringify({
                error: "Endpoint not found",
                available: ["/api/record", "/api/hot", "/api/hot-by-type", "/api/sync", "/api/debug", "/api/health", "/api/ping", "/api/request", "/api/auth/*", "/api/clear-stats"]
            }), {
                status: 404,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
    }
}

// ============================================================
// 增强的 handleRecord 函数
// ============================================================
async function handleRecord(request, env, url, corsHeaders) {
    let keyword = '';
    let requestMethod = request.method;

    console.log(`收到 ${requestMethod} 请求到 /api/record`);

    // 根据请求方法获取关键词
    switch (requestMethod) {
        case 'GET':
            keyword = url.searchParams.get("q") || url.searchParams.get("keyword");
            break;

        case 'POST':
            try {
                const contentType = request.headers.get("content-type") || "";

                if (contentType.includes("application/json")) {
                    // JSON 格式
                    const body = await request.json();
                    keyword = body.keyword || body.q || body.query || body.search;
                } else if (contentType.includes("application/x-www-form-urlencoded")) {
                    // 表单格式
                    const formData = await request.formData();
                    keyword = formData.get("keyword") || formData.get("q");
                } else if (contentType.includes("text/plain")) {
                    // 纯文本
                    keyword = await request.text();
                } else {
                    // 尝试解析为 JSON
                    try {
                        const body = await request.json();
                        keyword = body.keyword;
                    } catch {
                        keyword = url.searchParams.get("q") || "";
                    }
                }
            } catch (error) {
                console.error("解析请求体失败:", error);
                return new Response(JSON.stringify({
                    success: false,
                    error: "Parse error",
                    message: "无法解析请求数据",
                    hint: "请使用: GET /api/record?q=关键词 或 POST with {'keyword':'关键词'}"
                }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }
            break;

        default:
            return new Response(JSON.stringify({
                success: false,
                error: "Method not allowed",
                allowed: ["GET", "POST"],
                usage: {
                    GET: "/api/record?q=关键词",
                    POST: '{"keyword":"关键词"}'
                }
            }), {
                status: 405,
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
    }

    // 验证关键词
    if (!keyword || keyword.trim() === "") {
        return new Response(JSON.stringify({
            success: false,
            error: "Missing keyword",
            received: { keyword, method: requestMethod },
            usage: {
                GET: "/api/record?q=电影",
                POST: 'curl -X POST -H "Content-Type: application/json" -d \'{"keyword":"电影"}\' /api/record'
            }
        }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    const normalizedKeyword = keyword.trim().toLowerCase();

    // 检查关键词长度
    if (normalizedKeyword.length > 100) {
        return new Response(JSON.stringify({
            success: false,
            error: "Keyword too long",
            maxLength: 100,
            receivedLength: normalizedKeyword.length
        }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // 获取并更新统计
    let stats = {};
    try {
        const statsData = await env.SEARCH_STATS.get("stats");
        if (statsData) {
            stats = JSON.parse(statsData);
        }
    } catch (e) {
        console.error("读取 KV 失败:", e);
        stats = {};
    }

    // 更新计数
    const currentCount = (stats[normalizedKeyword] || 0) + 1;
    stats[normalizedKeyword] = currentCount;

    // 保存到 KV
    try {
        await env.SEARCH_STATS.put("stats", JSON.stringify(stats));
    } catch (e) {
        console.error("保存 KV 失败:", e);
        // 继续返回响应，即使保存失败
    }

    // 准备响应
    const responseData = {
        success: true,
        keyword: normalizedKeyword,
        count: currentCount,
        method: requestMethod,
        timestamp: new Date().toISOString(),
        isHot: currentCount >= 10,
        hotLevel: getHotLevel(currentCount)
    };

    return new Response(JSON.stringify(responseData), {
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    });
}

// 其他处理函数保持不变...

// 处理热搜
async function handleHot(env, corsHeaders) {
    let stats = {};
    try {
        const statsData = await env.SEARCH_STATS.get("stats");
        if (statsData) {
            stats = JSON.parse(statsData);
        }
    } catch (e) {
        stats = {};
    }

    const THRESHOLD = 10;
    const hotList = Object.entries(stats)
    .filter(([_, count]) => count >= THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({
        word,
        count,
        isHot: count >= 50,
        level: getHotLevel(count)
    }));

    return new Response(JSON.stringify(hotList), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

// 按类型返回热搜
async function handleHotByType(request, env, corsHeaders) {
    try {
        // 获取搜索统计
        let stats = {};
        try {
            const statsData = await env.SEARCH_STATS.get("stats");
            if (statsData) {
                stats = JSON.parse(statsData);
            }
        } catch (e) {
            stats = {};
        }

        // 获取资源数据（包含type）
        let resources = [];
        try {
            const resourcesRes = await fetch("https://www.weiyingjun.top/data.json");
            resources = await resourcesRes.json();
        } catch (e) {
            console.error("获取资源数据失败:", e);
        }

        // 建立 word -> type 的映射
        const wordToType = {};
        resources.forEach(item => {
            const type = item.type || '其他';
            // 从title和keywords提取关键词
            if (item.title) {
                wordToType[item.title.toLowerCase()] = type;
            }
            if (item.keywords) {
                item.keywords.forEach(k => {
                    wordToType[k.toLowerCase()] = type;
                });
            }
            if (item.search_aliases) {
                item.search_aliases.forEach(a => {
                    wordToType[a.toLowerCase()] = type;
                });
            }
        });

        // 按type分组统计
        const typeStats = {};
        Object.entries(stats).forEach(([word, count]) => {
            const wordLower = word.toLowerCase();
            let type = '其他';
            
            // 尝试匹配
            for (const [key, t] of Object.entries(wordToType)) {
                if (wordLower.includes(key) || key.includes(wordLower)) {
                    type = t;
                    break;
                }
            }
            
            if (!typeStats[type]) {
                typeStats[type] = [];
            }
            typeStats[type].push({ word, count });
        });

        // 每个type取前10条
        const result = {};
        Object.entries(typeStats).forEach(([type, list]) => {
            result[type] = list
                .sort((a, b) => b.count - a.count)
                .slice(0, 10)
                .map(item => ({ word: item.word, count: item.count }));
        });

        return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
}

// 修改handleSync函数，添加错误处理
async function handleSync(request, env, url, corsHeaders) {
    try {
        console.log("🔧 handleSync 被调用");

        const secret = url.searchParams.get("key");
        console.log("收到的密钥:", secret ? "已提供" : "未提供");

        if (secret !== "my_secret_sync_key") {
            console.log("❌ 密钥验证失败");
            return new Response("Unauthorized", {
                status: 401,
                headers: {
                    "Content-Type": "text/plain",
                    ...corsHeaders
                }
            });
        }

        console.log("✅ 密钥验证通过");

        let stats = {};
        try {
            const statsData = await env.SEARCH_STATS.get("stats");
            console.log("从KV获取数据:", statsData ? "成功" : "空");

            if (statsData) {
                stats = JSON.parse(statsData);
                console.log("解析后的统计:", Object.keys(stats).length, "个关键词");
            }
        } catch (e) {
            console.error("读取KV失败:", e);
            stats = {};
        }

        const THRESHOLD = 10;
        console.log("筛选阈值:", THRESHOLD);

        // 筛选统计
        const filteredStats = {};
        Object.entries(stats).forEach(([word, count]) => {
            if (count >= THRESHOLD) {
                filteredStats[word] = count;
            }
        });

        console.log("筛选后关键词数:", Object.keys(filteredStats).length);

        // 排序
        const sortedEntries = Object.entries(filteredStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);

        console.log("排序后保留:", sortedEntries.length, "个");

        const result = Object.fromEntries(sortedEntries);

        // 返回结果
        return new Response(JSON.stringify({
            success: true,
            count: sortedEntries.length,
            stats: result,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders
            }
        });

    } catch (error) {
        console.error("❌ handleSync 错误详情:", error);
        console.error("错误堆栈:", error.stack);

        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders
            }
        });
    }
}


// ============================================================
// 处理资源缺口榜 /api/gap
// ============================================================
async function handleGap(env, corsHeaders) {
    try {
        // 1️⃣ 读取搜索统计（和 hot 保持一致）
        let stats = {};
        try {
            const statsData = await env.SEARCH_STATS.get("stats");
            if (statsData) {
                stats = JSON.parse(statsData);
            }
        } catch {
            stats = {};
        }

        const THRESHOLD = 5;

        // 2️⃣ 拉取 data.json（你的资源池）
        let dataList = [];
        try {
            const dataRes = await fetch("https://www.weiyingjun.top/data.json");
            dataList = await dataRes.json();
        } catch (e) {
            console.error("❌ data.json 加载失败", e);
            dataList = [];
        }

        const gaps = [];

        // 3️⃣ 遍历热搜词
        Object.entries(stats).forEach(([word, count]) => {
            if (count < THRESHOLD) return;

            const keyword = word.trim();

            // 过滤主站域名
            const BLOCK_DOMAINS = [
                'weiyingjun.top',
                'www.weiyingjun.top',
                'https://www.weiyingjun.top',
                'https://weiyingjun.top',
                '三人','三人本',
                '四人','四人本'
            ];
            const normalizedKeyword = keyword.toLowerCase().replace(/\s/g, '');
            const isBlocked = BLOCK_DOMAINS.some(domain => 
                normalizedKeyword.includes(domain.toLowerCase().replace(/\s/g, ''))
            );
            if (isBlocked) return;

            // 是否命中任何资源
            const matched = dataList.some(item => {
                // 如果有 search_aliases，用别名匹配（双向匹配）
                if (Array.isArray(item.search_aliases) && item.search_aliases.length > 0) {
                    return item.search_aliases.some(alias =>
                        keyword.includes(alias) || alias.includes(keyword)
                    );
                }

                // 没有别名时，用 title 匹配
                if (item.title && item.title.includes(keyword)) {
                    return true;
                }

                // keywords 模糊匹配
                if (Array.isArray(item.keywords)) {
                    return item.keywords.some(k =>
                    keyword.includes(k) || k.includes(keyword)
                    );
                }

                return false;
            });

            // ❌ 没命中 → 资源缺口
            if (!matched) {
                gaps.push({
                    word: keyword,
                    count,
                    level: getHotLevel(count),
                          reason: "热度高但 data.json 暂无匹配资源",
                          first_seen: new Date().toISOString().slice(0, 10)
                });
            }
        });

        // 4️⃣ 按热度排序
        gaps.sort((a, b) => b.count - a.count);

        return new Response(JSON.stringify(gaps, null, 2), {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                ...corsHeaders
            }
        });

    } catch (e) {
        console.error("❌ handleGap error:", e);
        return new Response(JSON.stringify({
            error: "gap 接口生成失败",
            message: e.message
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders
            }
        });
    }
}


// 处理调试
async function handleDebug(request, env, corsHeaders) {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    // 列出所有注册用户
    if (type === 'users') {
        const list = await env.SEARCH_STATS.list({ prefix: 'user:' });
        const users = [];
        for (const key of list.keys) {
            const userData = await env.SEARCH_STATS.get(key.name);
            if (userData) {
                const user = JSON.parse(userData);
                users.push({
                    username: user.username,
                    userId: user.userId,
                    createdAt: user.createdAt
                });
            }
        }
        return new Response(JSON.stringify({
            type: 'users',
            total: users.length,
            users: users
        }, null, 2), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // 列出所有设备注册记录
    if (type === 'devices') {
        const list = await env.SEARCH_STATS.list({ prefix: 'device_reg:' });
        const devices = [];
        for (const key of list.keys) {
            const data = await env.SEARCH_STATS.get(key.name);
            if (data) {
                devices.push({
                    key: key.name,
                    ...JSON.parse(data)
                });
            }
        }
        return new Response(JSON.stringify({
            type: 'devices',
            total: devices.length,
            devices: devices
        }, null, 2), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // 列出所有IP注册记录
    if (type === 'ips') {
        const list = await env.SEARCH_STATS.list({ prefix: 'ip_reg:' });
        const ips = [];
        for (const key of list.keys) {
            const data = await env.SEARCH_STATS.get(key.name);
            if (data) {
                ips.push({
                    key: key.name,
                    ...JSON.parse(data)
                });
            }
        }
        return new Response(JSON.stringify({
            type: 'ips',
            total: ips.length,
            ips: ips
        }, null, 2), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    let stats = {};
    try {
        const statsData = await env.SEARCH_STATS.get("stats");
        if (statsData) {
            stats = JSON.parse(statsData);
        }
    } catch (e) {
        stats = {};
    }

    const THRESHOLD = 10;
    const allStats = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({
        word,
        count,
        meetsThreshold: count >= THRESHOLD
    }));

    const statsSummary = {
        totalKeywords: Object.keys(stats).length,
        totalSearches: Object.values(stats).reduce((sum, count) => sum + count, 0),
        threshold: THRESHOLD,
        keywordsAboveThreshold: allStats.filter(item => item.meetsThreshold).length,
        averageSearchesPerKeyword: Object.keys(stats).length > 0
        ? (Object.values(stats).reduce((sum, count) => sum + count, 0) / Object.keys(stats).length).toFixed(2)
        : "0.00",
        topKeywords: allStats.slice(0, 10)
    };

    return new Response(JSON.stringify({
        debug: true,
        summary: statsSummary,
        allStats: allStats,
        timestamp: new Date().toISOString()
    }, null, 2), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

// 处理健康检查
async function handleHealth(corsHeaders) {
    return new Response(JSON.stringify({
        status: "healthy",
        service: "quark-search-api",
        timestamp: new Date().toISOString(),
                                       endpoints: [
                                           "/api/record",
                                           "/api/hot",
                                           "/api/sync",
                                           "/api/debug",
                                           "/api/health"
                                       ]
    }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

// 处理 ping
async function handlePing(corsHeaders) {
    return new Response(JSON.stringify({
        pong: Date.now(),
                                       timestamp: new Date().toISOString()
    }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

/* ============================================================
 *  资源登记接口 /api/request
 *  防刷机制：IP频率限制 + 关键词限制
  = *=========================================================== */

const RATE_LIMIT = {
    MAX_REQUESTS: 2,
    WINDOW_MS: 60 * 60 * 1000
};

// 用户转存/查看配置
const TRANSFER_CONFIG = {
    MAX_TRANSFERS_PER_DAY: 2,  // 每个用户每天最大查看/转存次数
    MAX_DEVICE_TRANSFERS_PER_DAY: 2,  // 每个设备每天最大转存次数
    MAX_DEVICES_PER_IP_DAY: 2,  // 每个IP每天最多2个设备转存
    TOKEN_EXPIRY_DAYS: 7        // token有效期天数
};

// 防多账号注册配置
const ANTI_MULTI_ACCOUNT = {
    MAX_ACCOUNTS_PER_IP: 3,    // 每个IP永久最多注册3个账号
    MAX_ACCOUNTS_PER_DEVICE: 1 // 每个设备永久最多注册1个账号
};

function getClientIP(request) {
    const cfIP = request.headers.get('CF-Connecting-IP');
    if (cfIP) return cfIP;
    
    const forwarded = request.headers.get('X-Forwarded-For');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return 'unknown';
}

function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

function getTodayDate() {
    // 使用北京时间 (UTC+8)
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 检查用户是否是VIP
async function checkIsVip(env, username) {
    if (!username) return false;
    
    const vipUsersStr = await env.SEARCH_STATS.get('vip_users');
    if (!vipUsersStr) return false;
    
    try {
        const vipUsers = JSON.parse(vipUsersStr);
        return vipUsers.includes(username.toLowerCase());
    } catch {
        return false;
    }
}

async function handleAuthRegister(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false,
            error: 'Method not allowed'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({
            success: false,
            error: 'Invalid JSON'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const { username, password } = body;

    if (!username || !password) {
        return new Response(JSON.stringify({
            success: false,
            error: '用户名和密码不能为空'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    if (username.length < 3 || username.length > 20) {
        return new Response(JSON.stringify({
            success: false,
            error: '用户名长度需在3-20个字符之间'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    if (password.length < 6) {
        return new Response(JSON.stringify({
            success: false,
            error: '密码长度需至少6个字符'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const userKey = `user:${username.toLowerCase()}`;
    const existingUser = await env.SEARCH_STATS.get(userKey);

    if (existingUser) {
        return new Response(JSON.stringify({
            success: false,
            error: '用户名已存在'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    // 检查设备指纹和IP注册限制
    const clientIP = getClientIP(request);
    const deviceId = request.headers.get('X-Device-ID') || request.headers.get('x-device-id') || '';

    // 检查IP是否在白名单中
    const whitelistKey = 'ip_whitelist';
    const whitelistData = await env.SEARCH_STATS.get(whitelistKey);
    const whitelist = whitelistData ? JSON.parse(whitelistData) : [];
    const isWhitelisted = whitelist.includes(clientIP);
   
    // 检查IP注册限制（永久），白名单IP跳过
    if (!isWhitelisted) {
        const ipRegKey = `ip_reg:${clientIP}`;
        const ipRegData = await env.SEARCH_STATS.get(ipRegKey);
        if (ipRegData) {
            const ipReg = JSON.parse(ipRegData);
            if (ipReg.count >= ANTI_MULTI_ACCOUNT.MAX_ACCOUNTS_PER_IP) {
                return new Response(JSON.stringify({
                    success: false,
                    error: '该IP注册次数已达上限'
                }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        // 检查设备注册限制（永久），白名单IP跳过
        if (deviceId) {
            const deviceRegKey = `device_reg:${deviceId}`;
            const deviceRegData = await env.SEARCH_STATS.get(deviceRegKey);
            if (deviceRegData) {
                const deviceReg = JSON.parse(deviceRegData);
                if (deviceReg.count >= ANTI_MULTI_ACCOUNT.MAX_ACCOUNTS_PER_DEVICE) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: '该设备注册次数已达上限'
                    }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }
            }

            // 记录设备注册（永久存储）
            let deviceRegCount = 1;
            if (deviceRegData) {
                const deviceReg = JSON.parse(deviceRegData);
                deviceRegCount = deviceReg.count + 1;
            }
            await env.SEARCH_STATS.put(deviceRegKey, JSON.stringify({ count: deviceRegCount, lastReg: new Date().toISOString() }));
        }

        // 记录IP注册（永久存储）
        let ipRegCount = 1;
        if (ipRegData) {
            const ipReg = JSON.parse(ipRegData);
            ipRegCount = ipReg.count + 1;
        }
        await env.SEARCH_STATS.put(ipRegKey, JSON.stringify({ count: ipRegCount, lastReg: new Date().toISOString() }));
    }
    
    const userId = generateToken();
    const passwordHash = hashPassword(password);
    const userData = {
        userId,
        username: username.toLowerCase(),
        passwordHash,
        createdAt: new Date().toISOString()
    };

    await env.SEARCH_STATS.put(userKey, JSON.stringify(userData));

    return new Response(JSON.stringify({
        success: true,
        message: '注册成功',
        userId
    }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

async function handleAuthLogin(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false,
            error: 'Method not allowed'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({
            success: false,
            error: 'Invalid JSON'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const { username, password } = body;

    if (!username || !password) {
        return new Response(JSON.stringify({
            success: false,
            error: '用户名和密码不能为空'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const userKey = `user:${username.toLowerCase()}`;
    const userDataStr = await env.SEARCH_STATS.get(userKey);

    if (!userDataStr) {
        return new Response(JSON.stringify({
            success: false,
            error: '用户名或密码错误'
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const userData = JSON.parse(userDataStr);
    const passwordHash = hashPassword(password);

    if (passwordHash !== userData.passwordHash) {
        return new Response(JSON.stringify({
            success: false,
            error: '用户名或密码错误'
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const token = generateToken();
    const tokenKey = `token:${token}`;
    
    // 检查是否是VIP用户
    const isVip = await checkIsVip(env, username.toLowerCase());
    
    const tokenData = {
        userId: userData.userId,
        username: userData.username,
        isVip: isVip,
        expiresAt: new Date(Date.now() + TRANSFER_CONFIG.TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    };

    await env.SEARCH_STATS.put(tokenKey, JSON.stringify(tokenData));

    return new Response(JSON.stringify({
        success: true,
        message: '登录成功',
        token,
        userId: userData.userId,
        username: userData.username,
        isVip: isVip
    }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

async function verifyToken(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.slice(7);
    const tokenKey = `token:${token}`;
    const tokenDataStr = await env.SEARCH_STATS.get(tokenKey);

    if (!tokenDataStr) {
        return null;
    }

    const tokenData = JSON.parse(tokenDataStr);
    if (new Date(tokenData.expiresAt) < new Date()) {
        return null;
    }

    return tokenData;
}

async function handleTransfer(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false,
            error: 'Method not allowed'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const userData = await verifyToken(request, env);

    if (!userData) {
        return new Response(JSON.stringify({
            success: false,
            error: '未登录，请先登录'
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({
            success: false,
            error: 'Invalid JSON'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const { keyword, shareLink } = body;

    if (!keyword) {
        return new Response(JSON.stringify({
            success: false,
            error: '关键词不能为空'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    // 获取设备指纹
    const clientIP = getClientIP(request);
    const deviceId = request.headers.get('X-Device-ID') || request.headers.get('x-device-id') || '';
    const today = getTodayDate();

    // 检查设备转存限制（不管用哪个账号，每个设备每天最多2次）
    if (deviceId) {
        const deviceTransferKey = `device_transfer:${deviceId}:${today}`;
        const deviceTransferStr = await env.SEARCH_STATS.get(deviceTransferKey);
        if (deviceTransferStr) {
            const deviceTransfer = JSON.parse(deviceTransferStr);
            if (deviceTransfer.count >= TRANSFER_CONFIG.MAX_DEVICE_TRANSFERS_PER_DAY) {
                return new Response(JSON.stringify({
                    success: false,
                    error: `该设备今日转存次数已达上限（每日限制${TRANSFER_CONFIG.MAX_DEVICE_TRANSFERS_PER_DAY}次）`,
                    remaining: 0,
                    isDeviceLimit: true
                }), {
                    status: 429,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }
    }

    // 检查IP设备数量限制（每个IP每天最多2个设备转存）
    if (clientIP && clientIP !== 'unknown') {
        const ipDeviceKey = `ip_device:${clientIP}:${today}`;
        let ipDevices = [];
        const ipDeviceStr = await env.SEARCH_STATS.get(ipDeviceKey);
        if (ipDeviceStr) {
            ipDevices = JSON.parse(ipDeviceStr);
        }
        
        // 如果当前设备不在列表中，检查是否超限
        if (!ipDevices.includes(deviceId) && ipDevices.length >= TRANSFER_CONFIG.MAX_DEVICES_PER_IP_DAY) {
            return new Response(JSON.stringify({
                success: false,
                error: `该IP今日设备数已达上限（最多${TRANSFER_CONFIG.MAX_DEVICES_PER_IP_DAY}个设备）`,
                remaining: 0,
                isIPLimit: true
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        // 添加当前设备到列表
        if (!ipDevices.includes(deviceId)) {
            ipDevices.push(deviceId);
            await env.SEARCH_STATS.put(ipDeviceKey, JSON.stringify(ipDevices));
        }
    }

    const transferKey = `transfer:${userData.userId}:${today}`;
    const transferDataStr = await env.SEARCH_STATS.get(transferKey);

    let transferCount = 0;
    if (transferDataStr) {
        const transferData = JSON.parse(transferDataStr);
        transferCount = transferData.count;
    }

    if (transferCount >= TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY) {
        return new Response(JSON.stringify({
            success: false,
            error: `今天转存次数已用完，明天再来吧（每日限制${TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY}次）`,
            remaining: 0,
            resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const newTransferData = {
        count: transferCount + 1,
        lastTransfer: new Date().toISOString(),
        keyword
    };
    await env.SEARCH_STATS.put(transferKey, JSON.stringify(newTransferData));

    // 记录设备转存次数
    if (deviceId) {
        const deviceTransferKey = `device_transfer:${deviceId}:${today}`;
        let deviceTransferCount = 0;
        const deviceTransferStr = await env.SEARCH_STATS.get(deviceTransferKey);
        if (deviceTransferStr) {
            const deviceTransfer = JSON.parse(deviceTransferStr);
            deviceTransferCount = deviceTransfer.count;
        }
        await env.SEARCH_STATS.put(deviceTransferKey, JSON.stringify({
            count: deviceTransferCount + 1,
            lastTransfer: new Date().toISOString()
        }));
    }

    return new Response(JSON.stringify({
        success: true,
        message: '转存成功',
        remaining: TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY - transferCount - 1,
        keyword
    }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

async function handleTransferStatus(request, env, corsHeaders) {
    const userData = await verifyToken(request, env);

    if (!userData) {
        return new Response(JSON.stringify({
            success: false,
            error: '未登录'
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const today = getTodayDate();
    const transferKey = `transfer:${userData.userId}:${today}`;
    const transferDataStr = await env.SEARCH_STATS.get(transferKey);

    let transferCount = 0;
    if (transferDataStr) {
        const transferData = JSON.parse(transferDataStr);
        transferCount = transferData.count;
    }

    return new Response(JSON.stringify({
        success: true,
        userId: userData.userId,
        username: userData.username,
        todayCount: transferCount,
        maxPerDay: TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY,
        remaining: TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY - transferCount,
        canTransfer: transferCount < TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY
    }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

// 检查并消耗每日查看次数
async function handleCheckView(request, env, corsHeaders) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({
            success: false,
            error: 'Method not allowed'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const userData = await verifyToken(request, env);

    if (!userData) {
        return new Response(JSON.stringify({
            success: false,
            error: '未登录，请先登录'
        }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    // 检查是否是VIP用户
    const isVip = await checkIsVip(env, userData.username);
    if (isVip) {
        return new Response(JSON.stringify({
            success: true,
            allowed: true,
            isVip: true,
            remaining: '无限',
            message: 'VIP用户无限次数'
        }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const today = getTodayDate();
    const transferKey = `transfer:${userData.userId}:${today}`;
    const transferDataStr = await env.SEARCH_STATS.get(transferKey);

    let transferCount = 0;
    if (transferDataStr) {
        const transferData = JSON.parse(transferDataStr);
        transferCount = transferData.count;
    }

    // 检查今天是否已经用过
    if (transferCount >= TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY) {
        return new Response(JSON.stringify({
            success: false,
            allowed: false,
            error: `今天已查看过资源了，每天只能查看${TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY}次，明天再来吧！`,
            remaining: 0,
            maxPerDay: TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY
        }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    // 消耗一次查看次数
    const newTransferData = {
        count: transferCount + 1,
        lastView: new Date().toISOString()
    };
    await env.SEARCH_STATS.put(transferKey, JSON.stringify(newTransferData));

    return new Response(JSON.stringify({
        success: true,
        allowed: true,
        remaining: TRANSFER_CONFIG.MAX_TRANSFERS_PER_DAY - transferCount - 1,
        message: '可以查看资源'
    }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

async function handleLogout(request, env, corsHeaders) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({
            success: false,
            error: 'No token provided'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }

    const token = authHeader.slice(7);
    const tokenKey = `token:${token}`;
    await env.SEARCH_STATS.delete(tokenKey);

    return new Response(JSON.stringify({
        success: true,
        message: '登出成功'
    }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

async function checkRateLimit(env, clientIP, corsHeaders) {
    const key = `ratelimit:${clientIP}`;
    const now = Date.now();
    
    let record = await env.SEARCH_STATS.get(key);
    if (record) {
        const { count, windowStart } = JSON.parse(record);
        
        if (now - windowStart > RATE_LIMIT.WINDOW_MS) {
            await env.SEARCH_STATS.put(key, JSON.stringify({ count: 1, windowStart: now }));
            return { allowed: true };
        }
        
        if (count >= RATE_LIMIT.MAX_REQUESTS) {
            return { allowed: false, remainingTime: Math.ceil((windowStart + RATE_LIMIT.WINDOW_MS - now) / 1000 / 60) };
        }
        
        await env.SEARCH_STATS.put(key, JSON.stringify({ count: count + 1, windowStart }));
        return { allowed: true };
    }
    
    await env.SEARCH_STATS.put(key, JSON.stringify({ count: 1, windowStart: now }));
    return { allowed: true };
}

async function checkKeywordLimit(env, keyword, corsHeaders) {
    const key = `keyword_req:${keyword.toLowerCase()}`;
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    
    const record = await env.SEARCH_STATS.get(key);
    if (record) {
        const { lastRequest } = JSON.parse(record);
        if (now - lastRequest < DAY_MS) {
            return { allowed: false };
        }
    }
    
    await env.SEARCH_STATS.put(key, JSON.stringify({ lastRequest: now }));
    return { allowed: true };
}

async function handleRequest(request, env, corsHeaders) {

    if (request.method !== "POST") {
        return new Response(JSON.stringify({
            success: false,
            error: "Method not allowed"
        }), {
            status: 405,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }

    let keyword = "";

    try {
        const body = await request.json();
        keyword = (body.keyword || "").trim();
    } catch (e) {
        return new Response(JSON.stringify({
            success: false,
            error: "Invalid JSON"
        }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }

    if (!keyword) {
        return new Response(JSON.stringify({
            success: false,
            error: "关键词不能为空"
        }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }

    const blockedDomains = [
        'weiyingjun.top',
        'www.weiyingjun.top',
        'https://www.weiyingjun.top',
        'https://weiyingjun.top'
    ];
    const normalizedKeyword = keyword.toLowerCase().replace(/\s+/g, '').replace(/[\.\s]/g, '');
    const isBlocked = blockedDomains.some(domain => 
        normalizedKeyword.includes(domain.toLowerCase().replace(/\s+/g, '').replace(/[\.\s]/g, ''))
    );
    if (isBlocked) {
        return new Response(JSON.stringify({
            success: false,
            error: "该关键词已被过滤"
        }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }

    const clientIP = getClientIP(request);
    const rateLimitResult = await checkRateLimit(env, clientIP, corsHeaders);
    if (!rateLimitResult.allowed) {
        return new Response(JSON.stringify({
            success: false,
            error: `请求过于频繁，请${rateLimitResult.remainingTime}分钟后再试`
        }), {
            status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }

    const keywordLimitResult = await checkKeywordLimit(env, keyword, corsHeaders);
    if (!keywordLimitResult.allowed) {
        return new Response(JSON.stringify({
            success: false,
            error: "该关键词今天已提交过，请明天再试"
        }), {
            status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }

    if (!env.WECHAT_WEBHOOK) {
        return new Response(JSON.stringify({
            success: false,
            error: "未配置 WECHAT_WEBHOOK 环境变量"
        }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }

    // 手动生成时间字符串（避免乱码）- 转换为北京时间 UTC+8
    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const timeStr =
        beijingTime.getUTCFullYear() + "-" +
        String(beijingTime.getUTCMonth() + 1).padStart(2, '0') + "-" +
        String(beijingTime.getUTCDate()).padStart(2, '0') + " " +
        String(beijingTime.getUTCHours()).padStart(2, '0') + ":" +
        String(beijingTime.getUTCMinutes()).padStart(2, '0') + ":" +
        String(beijingTime.getUTCSeconds()).padStart(2, '0');

    const content =
    "新资源需求通知\n\n" +
    "关键词：" + keyword + "\n" +
    "时间：" + timeStr + "\n" +
    "来源：网站资源登记接口";

    try {
        await fetch(env.WECHAT_WEBHOOK.trim(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify({
                msgtype: "text",
                text: {
                    content: content
                }
            })
        });

        return new Response(JSON.stringify({
            success: true,
            message: "已成功提交，我们会尽快更新资源"
        }), {
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });

    } catch (err) {
        return new Response(JSON.stringify({
            success: false,
            error: "发送企业微信失败",
            detail: err.message
        }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
        });
    }
}


// 清除统计数据
async function handleClearStats(request, env, corsHeaders) {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    
    if (secret !== "debug123") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    
    await env.SEARCH_STATS.delete("stats");
    
    return new Response(JSON.stringify({
        success: true,
        message: "统计数据已清除"
    }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}


// 设置预设统计数据
async function handleSetStats(request, env, corsHeaders) {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    
    if (secret !== "debug123") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    
    // 预设热门关键词及其次数（只保留具体资源名称）
    const presetStats = {
        "老友记": 20,
        "机智的医生生活": 15,
        "绝命毒师": 10,
        "行尸走肉": 10,
        "请回答1988": 10,
        "亢奋": 10,
        "黑袍纠察队": 10,
        "大西洋帝国": 10,
        "越狱": 10,
        "奇幻沼泽": 20,
        "猫头鹰魔法社": 18,
        "飞出个未来": 10,
        "怪诞小镇": 10,
        "探险活宝": 10,
        "希尔达": 10,
        "马男波杰克": 10,
        "小马宝莉": 10,
        "外星也难民": 10,
        "一座城": 15,
        "中彩票": 12,
        "告别诗": 11,
        "上路": 10,
        "马丁内斯死在惊奇馆": 10,
        "一点半": 10,
        "人吃人": 10,
        "窗边的女人": 10,
        "离婚吧！赶紧的": 10,
        "归途": 10,
        "F1：狂飙飞车": 20,
        "家弑服务": 15,
        "悬崖绝壁": 12,
        "匿杀": 10,
        "侏罗纪世界：重生": 10,
        "风城2": 10,
        "肖申克的救赎": 10,
        "阿甘正传": 10,
        "星际穿越": 10,
        "楚门的世界": 10
    };
    
    await env.SEARCH_STATS.put("stats", JSON.stringify(presetStats));
    
    return new Response(JSON.stringify({
        success: true,
        message: "统计数据已设置",
        stats: presetStats
    }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}


// 删除单个预设关键词
async function handleDelStat(request, env, corsHeaders) {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");
    const keyword = url.searchParams.get("keyword");
    
    if (secret !== "debug123") {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    
    if (!keyword) {
        return new Response(JSON.stringify({ error: "缺少keyword参数" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    
    // 获取当前stats
    let stats = {};
    try {
        const statsData = await env.SEARCH_STATS.get("stats");
        if (statsData) {
            stats = JSON.parse(statsData);
        }
    } catch (e) {
        stats = {};
    }
    
    // 删除指定关键词
    if (stats[keyword]) {
        delete stats[keyword];
        await env.SEARCH_STATS.put("stats", JSON.stringify(stats));
        return new Response(JSON.stringify({
            success: true,
            message: `已删除关键词: ${keyword}`,
            remaining: Object.keys(stats)
        }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    } else {
        return new Response(JSON.stringify({
            success: false,
            error: `关键词不存在: ${keyword}`
        }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
}



// 辅助函数
function getHotLevel(count) {
    if (count >= 100) return "🔥🔥🔥";
    if (count >= 50) return "🔥🔥";
    if (count >= 20) return "🔥";
    if (count >= 10) return "👍";
    return "📊";
}

// IP白名单管理
async function handleIpWhitelist(request, env, corsHeaders) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    
    // 获取客户端IP
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Real-IP') || 
                     'unknown';
    
    if (action === 'add') {
        // 添加当前IP到白名单
        const whitelistKey = 'ip_whitelist';
        let whitelist = [];
        const existing = await env.SEARCH_STATS.get(whitelistKey);
        if (existing) {
            whitelist = JSON.parse(existing);
        }
        
        if (!whitelist.includes(clientIP)) {
            whitelist.push(clientIP);
            await env.SEARCH_STATS.put(whitelistKey, JSON.stringify(whitelist));
        }
        
        return new Response(JSON.stringify({
            success: true,
            message: 'IP已添加到白名单',
            ip: clientIP,
            whitelist: whitelist
        }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    
    if (action === 'list') {
        // 查看白名单
        const whitelistKey = 'ip_whitelist';
        const existing = await env.SEARCH_STATS.get(whitelistKey);
        const whitelist = existing ? JSON.parse(existing) : [];
        
        return new Response(JSON.stringify({
            whitelist: whitelist,
            currentIP: clientIP
        }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    
    if (action === 'remove') {
        // 删除指定IP或当前IP
        const ipToRemove = url.searchParams.get('ip') || clientIP;
        const whitelistKey = 'ip_whitelist';
        let whitelist = [];
        const existing = await env.SEARCH_STATS.get(whitelistKey);
        if (existing) {
            whitelist = JSON.parse(existing);
        }
        
        const index = whitelist.indexOf(ipToRemove);
        if (index > -1) {
            whitelist.splice(index, 1);
            await env.SEARCH_STATS.put(whitelistKey, JSON.stringify(whitelist));
            return new Response(JSON.stringify({
                success: true,
                message: 'IP已从白名单移除',
                removedIP: ipToRemove,
                whitelist: whitelist
            }), {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }
        
        return new Response(JSON.stringify({
            success: false,
            error: 'IP不在白名单中',
            ip: ipToRemove
        }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    
    // 默认返回当前IP
    return new Response(JSON.stringify({
        currentIP: clientIP,
        message: '访问 /api/ip-whitelist?action=add 将当前IP加入白名单，action=remove 删除白名单IP'
    }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}
