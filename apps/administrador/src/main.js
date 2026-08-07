import { auth, db, emailTecnico, normalizarNombre, firebaseConfig } from './firebase.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const money = (n = 0) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(n || 0));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
const safe = (v = '') => String(v).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

let currentAdmin = null;
let clientesCache = [];

function msg(el, text, type = 'notice') {
  el.innerHTML = text ? `<div class="notice ${type}">${safe(text)}</div>` : '';
}

function showApp(userData) {
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('adminName').textContent = userData.nombre || 'Administrador';
  $('fechaHoy').textContent = today();
  $('menuFecha').value = today();
}

async function requireAdmin(user) {
  const snap = await getDoc(doc(db, 'usuarios', user.uid));
  if (!snap.exists() || snap.data().rol !== 'admin' || snap.data().activo !== true) {
    await signOut(auth);
    throw new Error('Esta cuenta no tiene acceso de administrador.');
  }
  currentAdmin = { uid: user.uid, ...snap.data() };
  showApp(currentAdmin);
  await refreshAll();
}

$('loginBtn').addEventListener('click', async () => {
  msg($('loginMsg'), '');
  const nombre = $('loginNombre').value.trim();
  const pin = $('loginPin').value.trim();
  if (!nombre || !/^\d{6}$/.test(pin)) return msg($('loginMsg'), 'Ingresa nombre y un PIN de 6 dígitos.', 'error');
  try {
    await signInWithEmailAndPassword(auth, emailTecnico(nombre), pin);
  } catch (e) {
    msg($('loginMsg'), 'No se pudo iniciar sesión. Revisa nombre y PIN.', 'error');
  }
});

$('logoutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentAdmin = null;
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    return;
  }
  try { await requireAdmin(user); } catch (e) { msg($('loginMsg'), e.message, 'error'); }
});

for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    $(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
}

function menuRow(data = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid menu-row';
  wrap.innerHTML = `
    <label class="field"><span>Plato</span><input class="mi-nombre" value="${safe(data.nombre || '')}" placeholder="Ej. Papi Pollo"></label>
    <label class="field"><span>Precio</span><input class="mi-precio" type="number" min="0" step="0.01" value="${Number(data.precio || 3.5).toFixed(2)}"></label>
    <label class="field"><span>Descripción</span><input class="mi-desc" value="${safe(data.descripcion || '')}" placeholder="Opcional"></label>
    <label class="field"><span>Disponible</span><select class="mi-disponible"><option value="true" ${data.disponible !== false ? 'selected' : ''}>Sí</option><option value="false" ${data.disponible === false ? 'selected' : ''}>No</option></select></label>
    <div><button type="button" class="btn secondary quitar">Quitar</button></div>`;
  wrap.querySelector('.quitar').addEventListener('click', () => wrap.remove());
  $('menuItems').appendChild(wrap);
}

function resetMenuRows(opciones = []) {
  $('menuItems').innerHTML = '';
  (opciones.length ? opciones : [{ precio: 3.5 }, { precio: 3.5 }, { precio: 3.5 }]).forEach(menuRow);
}
resetMenuRows();
$('addMenuItem').addEventListener('click', () => menuRow({ precio: 3.5 }));

$('menuFecha').addEventListener('change', async () => {
  const id = $('menuFecha').value;
  if (!id) return;
  const snap = await getDoc(doc(db, 'menus', id));
  resetMenuRows(snap.exists() ? (snap.data().opciones || []) : []);
});

$('saveMenu').addEventListener('click', async () => {
  const fecha = $('menuFecha').value;
  if (!fecha) return msg($('menuMsg'), 'Selecciona una fecha.', 'error');
  const opciones = [...document.querySelectorAll('.menu-row')].map((row, i) => {
    const nombre = row.querySelector('.mi-nombre').value.trim();
    return {
      id: `${normalizarNombre(nombre) || 'plato'}-${i + 1}`,
      nombre,
      descripcion: row.querySelector('.mi-desc').value.trim(),
      precio: Number(row.querySelector('.mi-precio').value || 0),
      disponible: row.querySelector('.mi-disponible').value === 'true'
    };
  }).filter((x) => x.nombre && x.precio >= 0);
  if (!opciones.length) return msg($('menuMsg'), 'Agrega al menos un plato.', 'error');
  await setDoc(doc(db, 'menus', fecha), {
    fecha,
    semanaId: fecha.slice(0, 7),
    activo: true,
    opciones,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: currentAdmin.uid
  }, { merge: true });
  msg($('menuMsg'), 'Menú guardado correctamente.', 'success');
});

async function crearAuthUser(nombre, pin) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailTecnico(nombre), password: pin, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'No se pudo crear el usuario.');
  return data.localId;
}

$('crearCliente').addEventListener('click', async () => {
  msg($('clienteMsg'), '');
  const nombre = $('clienteNombre').value.trim();
  const tipo = $('clienteTipo').value;
  const pin = $('clientePin').value.trim();
  if (!nombre) return msg($('clienteMsg'), 'Ingresa el nombre.', 'error');
  try {
    if (tipo === 'ocasional') {
      await addDoc(collection(db, 'clientes'), {
        nombre,
        nombreNormalizado: normalizarNombre(nombre),
        tipo: 'ocasional',
        uid: null,
        activo: true,
        creadoEn: serverTimestamp(),
        creadoPor: currentAdmin.uid
      });
    } else {
      if (!/^\d{6}$/.test(pin)) throw new Error('El PIN debe tener exactamente 6 dígitos.');
      const uid = await crearAuthUser(nombre, pin);
      const rol = tipo === 'vendedor' ? 'vendedor' : 'comprador';
      await setDoc(doc(db, 'usuarios', uid), {
        nombre,
        nombreNormalizado: normalizarNombre(nombre),
        rol,
        activo: true,
        clienteId: rol === 'comprador' ? uid : null,
        creadoEn: serverTimestamp()
      });
      if (rol === 'comprador') {
        await setDoc(doc(db, 'clientes', uid), {
          nombre,
          nombreNormalizado: normalizarNombre(nombre),
          tipo: 'registrado',
          uid,
          activo: true,
          creadoEn: serverTimestamp(),
          creadoPor: currentAdmin.uid
        });
      }
    }
    $('clienteNombre').value = '';
    $('clientePin').value = '';
    msg($('clienteMsg'), 'Registro creado.', 'success');
    await loadClientes();
  } catch (e) {
    const translated = e.message.includes('EMAIL_EXISTS') ? 'Ya existe un usuario con ese nombre.' : e.message;
    msg($('clienteMsg'), translated, 'error');
  }
});

async function loadClientes() {
  const snap = await getDocs(collection(db, 'clientes'));
  clientesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.activo !== false).sort((a,b) => a.nombre.localeCompare(b.nombre));
  $('clientesBody').innerHTML = clientesCache.map((c) => `<tr><td>${safe(c.nombre)}</td><td>${safe(c.tipo)}</td><td>${c.activo !== false ? 'Sí' : 'No'}</td></tr>`).join('') || '<tr><td colspan="3">Sin clientes</td></tr>';
  $('pagoCliente').innerHTML = clientesCache.map((c) => `<option value="${safe(c.id)}">${safe(c.nombre)}</option>`).join('');
}

$('guardarPago').addEventListener('click', async () => {
  msg($('pagoMsg'), '');
  const cliente = clientesCache.find((c) => c.id === $('pagoCliente').value);
  const monto = Number($('pagoMonto').value || 0);
  const metodo = $('pagoMetodo').value;
  if (!cliente || monto <= 0) return msg($('pagoMsg'), 'Selecciona cliente e ingresa un monto válido.', 'error');
  await addDoc(collection(db, 'pagos'), {
    clienteId: cliente.id,
    clienteUid: cliente.uid || null,
    clienteNombre: cliente.nombre,
    monto,
    metodo,
    estado: 'confirmado',
    comprobanteId: null,
    registradoPor: currentAdmin.uid,
    creadoEn: serverTimestamp()
  });
  $('pagoMonto').value = '';
  msg($('pagoMsg'), 'Pago registrado.', 'success');
  await refreshAll();
});

async function loadPedidosHoy() {
  const snap = await getDocs(query(collection(db, 'pedidos'), where('fecha', '==', today())));
  const pedidos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  $('pedidosBody').innerHTML = pedidos.map((p) => `<tr><td>${safe(p.compradorNombre)}</td><td>${safe((p.items || []).map(i => `${i.cantidad}× ${i.nombre}`).join(', '))}</td><td>${money(p.total)}</td><td><span class="pill">${safe(p.estado)}</span></td><td>${safe(p.origen)}</td></tr>`).join('') || '<tr><td colspan="5">No hay pedidos hoy.</td></tr>';
  $('mPedidos').textContent = pedidos.filter((p) => p.estado !== 'cancelado').length;
  $('mVentas').textContent = money(pedidos.filter((p) => p.estado !== 'cancelado').reduce((s, p) => s + Number(p.total || 0), 0));
}

async function loadCuentas() {
  const [pedSnap, paySnap] = await Promise.all([getDocs(collection(db, 'pedidos')), getDocs(collection(db, 'pagos'))]);
  const pedidos = pedSnap.docs.map((d) => d.data()).filter((p) => p.estado !== 'cancelado');
  const pagos = paySnap.docs.map((d) => d.data()).filter((p) => p.estado !== 'anulado');
  const rows = clientesCache.map((c) => {
    const consumido = pedidos.filter((p) => p.clienteId === c.id).reduce((s,p) => s + Number(p.total || 0), 0);
    const pagado = pagos.filter((p) => p.clienteId === c.id).reduce((s,p) => s + Number(p.monto || 0), 0);
    return { ...c, consumido, pagado, saldo: consumido - pagado };
  }).sort((a,b) => b.saldo - a.saldo);
  $('cuentasBody').innerHTML = rows.map((r) => `<tr><td>${safe(r.nombre)}</td><td>${money(r.consumido)}</td><td>${money(r.pagado)}</td><td><strong>${money(r.saldo)}</strong></td></tr>`).join('') || '<tr><td colspan="4">Sin datos.</td></tr>';
  $('mPendiente').textContent = money(rows.reduce((s,r) => s + Math.max(r.saldo, 0), 0));

  const start = new Date(`${today()}T00:00:00-05:00`).getTime();
  const end = start + 86400000;
  const cobradoHoy = paySnap.docs.reduce((sum, d) => {
    const x = d.data();
    const ms = x.creadoEn?.toMillis?.() || 0;
    return sum + (x.estado !== 'anulado' && ms >= start && ms < end ? Number(x.monto || 0) : 0);
  }, 0);
  $('mCobrado').textContent = money(cobradoHoy);
}

async function loadComprobantes() {
  const snap = await getDocs(collection(db, 'comprobantes'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
  $('comprobantesList').innerHTML = '';
  if (!docs.length) $('comprobantesList').innerHTML = '<p class="muted">No hay comprobantes.</p>';
  for (const c of docs) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="row"><div><strong>${safe(c.clienteNombre || 'Cliente')}</strong><div class="muted">${money(c.montoDeclarado)} · ${safe(c.estado)}</div></div><div class="row"><a class="btn secondary" target="_blank" href="/api/comprobantes?key=${encodeURIComponent(c.r2Key || '')}">Ver archivo</a>${c.estado === 'pendiente' ? `<button class="btn primary aprobar">Aprobar</button><button class="btn danger rechazar">Rechazar</button>` : ''}</div></div>`;
    if (c.estado === 'pendiente') {
      card.querySelector('.aprobar').addEventListener('click', async () => {
        await updateDoc(doc(db, 'comprobantes', c.id), { estado: 'aprobado', revisadoEn: serverTimestamp(), revisadoPor: currentAdmin.uid });
        await addDoc(collection(db, 'pagos'), {
          clienteId: c.clienteId,
          clienteUid: c.clienteUid || null,
          clienteNombre: c.clienteNombre,
          monto: Number(c.montoDeclarado || 0),
          metodo: 'transferencia',
          estado: 'confirmado',
          comprobanteId: c.id,
          registradoPor: currentAdmin.uid,
          creadoEn: serverTimestamp()
        });
        await refreshAll();
      });
      card.querySelector('.rechazar').addEventListener('click', async () => {
        await updateDoc(doc(db, 'comprobantes', c.id), { estado: 'rechazado', revisadoEn: serverTimestamp(), revisadoPor: currentAdmin.uid });
        await loadComprobantes();
      });
    }
    $('comprobantesList').appendChild(card);
  }
}

async function refreshAll() {
  await loadClientes();
  await Promise.all([loadPedidosHoy(), loadCuentas(), loadComprobantes()]);
}

$('refreshBtn').addEventListener('click', refreshAll);
