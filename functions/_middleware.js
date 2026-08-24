// functions/_middleware.js
// 全局中间件：
// 1. HTTP -> HTTPS 301 重定向
// 2. 非 www 域名（weiyingjun.top）301 重定向到 www.weiyingjun.top
// 3. /search/xxx 重定向到 /search/xxx.html（避免重复收录）
// 4. 为搜索查询页（?q=xxx）添加 noindex 标记
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const host = url.hostname.toLowerCase();

    // 1. HTTP -> HTTPS
    if (url.protocol === 'http:') {
        url.protocol = 'https:';
        return Response.redirect(url.toString(), 301);
    }

    // 2. 非 www 重定向到 www
    if (host !== 'www.weiyingjun.top' && host.endsWith('weiyingjun.top')) {
        url.hostname = 'www.weiyingjun.top';
        return Response.redirect(url.toString(), 301);
    }

    // 3. /search/xxx 重定向到 /search/xxx.html（避免重复收录）
    const pathMatch = url.pathname.match(/^\/search\/([^/]+)$/);
    if (pathMatch && !url.pathname.endsWith('.html')) {
        url.pathname = url.pathname + '.html';
        return Response.redirect(url.toString(), 301);
    }

    // 4. 搜索查询页添加 noindex
    if (url.searchParams.has('q')) {
        const response = await context.next();
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return newResponse;
    }

    return context.next();
}