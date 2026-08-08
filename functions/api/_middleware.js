// functions/api/_middleware.js
// 给所有 /api/ 响应添加 X-Robots-Tag: noindex，替代 robots.txt 的 Disallow: /api/
// 这样 Google 可抓取但不收录，Search Console 不再报「已被 robots.txt 屏蔽」
export async function onRequest(context) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}