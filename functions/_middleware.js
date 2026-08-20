// functions/_middleware.js
// 全局中间件：将非 www 域名（weiyingjun.top）301 重定向到 www.weiyingjun.top
// 目的：消除 Google Search Console 里的「备用网页」重复收录项
// 注意：www 请求直接放行，/api/** 仍由 functions/api/_middleware.js 负责 noindex
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const host = url.hostname.toLowerCase();

    if (host !== 'www.weiyingjun.top' && host.endsWith('weiyingjun.top')) {
        url.hostname = 'www.weiyingjun.top';
        return Response.redirect(url.toString(), 301);
    }

    return context.next();
}