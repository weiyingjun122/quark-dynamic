// functions/_middleware.js
// 全局中间件：
// 1. 将非 www 域名（weiyingjun.top）301 重定向到 www.weiyingjun.top
// 2. 为搜索查询页（?q=xxx）添加 noindex 标记
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const host = url.hostname.toLowerCase();

    // 1. 非 www 重定向到 www
    if (host !== 'www.weiyingjun.top' && host.endsWith('weiyingjun.top')) {
        url.hostname = 'www.weiyingjun.top';
        return Response.redirect(url.toString(), 301);
    }

    // 2. 搜索查询页添加 noindex
    if (url.searchParams.has('q')) {
        const response = await context.next();
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return newResponse;
    }

    return context.next();
}