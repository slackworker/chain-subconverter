/**
 * Serves static subscription fixtures under /dual-landing/download/*.
 * Maps ?target=ClashMeta|URI to sibling asset files (*.clashmeta, *.uri).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let assetPath = url.pathname;

    const target = url.searchParams.get("target");
    if (target === "ClashMeta") {
      assetPath += ".clashmeta";
    } else if (target === "URI") {
      assetPath += ".uri";
    }

    const assetURL = new URL(assetPath, url.origin);
    const response = await env.ASSETS.fetch(
      new Request(assetURL, { method: request.method, headers: request.headers }),
    );
    if (response.status === 404) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers(response.headers);
    headers.set("content-type", "text/plain; charset=utf-8");
    headers.set("access-control-allow-origin", "*");
    return new Response(response.body, { status: response.status, headers });
  },
};
