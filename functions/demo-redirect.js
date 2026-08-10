// functions/demo-redirect.js
// 演示用重定向端点：/demo-redirect -> 302 跳转到文本提取工具
// 提供给「短链接还原」工具的示例短链使用，确保演示可复现
export async function onRequest(context) {
    return new Response(null, {
        status: 302,
        headers: {
            "Location": "https://www.weiyingjun.top/extract/",
            "Cache-Control": "no-store"
        }
    });
}