const FIREBASE_API_KEY = 'AIzaSyDcfDlewRojniHwrW_6bn6fQXEfHiXb7yg';

async function validarToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.users?.[0] || null;
}

export async function onRequest({ request, env }) {
  if (!env.COMPROBANTES) return Response.json({ error: 'Falta vincular el bucket R2 COMPROBANTES.' }, { status: 500 });
  const user = await validarToken(request);
  if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  if (request.method !== 'GET') return new Response('Método no permitido', { status: 405 });
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return Response.json({ error: 'Falta key.' }, { status: 400 });
  const object = await env.COMPROBANTES.get(key);
  if (!object) return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, no-store'
    }
  });
}
