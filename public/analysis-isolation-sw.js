/* Only this application's own responses are changed. No cache or external proxy. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const response = await fetch(event.request);
    if (response.type === 'opaque' || response.status === 0) return response;
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    // Safari supports require-corp, but not credentialless.
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    // WebKit can expose a stream on conditional 304 responses. Fetch forbids
    // bodies for these statuses; preserve revalidation without inventing one.
    const body = [204, 205, 304].includes(response.status) || event.request.method === 'HEAD' ? null : response.body;
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  })());
});
