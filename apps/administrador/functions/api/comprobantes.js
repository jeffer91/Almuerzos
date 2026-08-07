export async function onRequest({ request, env }) {
  if (!env.COMPROBANTES) return Response.json({ error: 'Falta vincular el bucket R2 COMPROBANTES.' }, { status: 500 });
  if (request.method !== 'GET') return new Response('Método no permitido', { status: 405 });
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !key.startsWith('comprobantes/')) return Response.json({ error: 'Clave inválida.' }, { status: 400 });
  const object = await env.COMPROBANTES.get(key);
  if (!object) return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}
