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

  if (request.method === 'POST') {
    const user = await validarToken(request);
    if (!user) return Response.json({ error: 'No autorizado.' }, { status: 401 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'Archivo requerido.' }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: 'Máximo 5 MB.' }, { status: 400 });
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) return Response.json({ error: 'Formato no permitido.' }, { status: 400 });
    const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const key = `comprobantes/${user.localId}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
    await env.COMPROBANTES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { ownerUid: user.localId, originalName: file.name }
    });
    return Response.json({ key });
  }

  if (request.method === 'GET') {
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

  return new Response('Método no permitido', { status: 405 });
}
