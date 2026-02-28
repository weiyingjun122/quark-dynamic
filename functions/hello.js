export async function onRequest(context) {
  return new Response(JSON.stringify({
    message: "Hello from Pages Functions!",
    timestamp: new Date().toISOString(),
    path: new URL(context.request.url).pathname
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
