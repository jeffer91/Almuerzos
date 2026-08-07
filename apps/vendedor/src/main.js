import { auth, db, emailTecnico } from './firebase.js';
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

let currentSeller = null;
let clientesCache = [];
let menuHoy = [];
let cuentasCache = [];

function msg(el, text, type = 'notice') {
  el.innerHTML = text ? `<div class="notice ${type}">${safe(text)}</div>` : '';
}

async function requireSeller(user) {
  const snap = await getDoc(doc(db, 'usuarios', user.uid));
  if (!snap.exists() || !['vendedor','admin'].includes(snap.data().rol) || snap.data().activo !== true) {
    await signOut(auth);
    throw new Error('Esta cuenta no tiene acceso de vendedor.');
  }
  currentSeller = { uid: user.uid, ...snap.data() };
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('sellerName').textContent = currentSeller.nombre || 'Vendedor';
  $('fechaHoy').textContent = today();
  await refreshAll();
}

$('loginBtn').addEventListener('click', async () => {
  msg($('loginMsg'), '');
  const nombre = $('loginNombre').value.trim();
  const pin = $('loginPin').value.trim();
  if (!nombre || !/^\d{6}$/.test(pin)) return msg($('loginMsg'), 'Ingresa nombre y PIN de 6 dígitos.', 'error');
  try {
    await signInWithEmailAndPassword(auth, emailTecnico(nombre), pin);
  } catch {
    msg($('loginMsg'), 'Nombre o PIN incorrectos.', 'error');
  }
});

$('logoutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentSeller = null;
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    return;
  }
  try { await requireSeller(user); } catch (e) { msg($('loginMsg'), e.message, 'error'); }
});

for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    $(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
}

async function loadClientes() {
  const snap = await getDocs(collection(db, 'clientes'));
  clientesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.activo !== false).sort((a,b) => a.nombre.localeCompare(b.nombre));
  const opts = clientesCache.map((c) => `<option value="${safe(c.id)}">${safe(c.nombre)}${c.tipo === 'ocasional' ? ' · ocasional' : ''}</option>`).join('');
  $('pedidoCliente').innerHTML = opts;
  $('pagoCliente').innerHTML = opts;
}

async function loadMenu() {
  const snap = await getDoc(doc(db, 'menus', today()));
  menuHoy = snap.exists() && snap.data().activo !== false ? (snap.data().opciones || []).filter((x) => x.disponible !== false) : [];
  $('pedidoPlato').innerHTML = menuHoy.map((p, i) => `<option value="${i}">${safe(p.nombre)} · ${money(p.precio)}</option>`).join('') || '<option value="">No hay menú cargado</option>';
}

async function loadPedidos() {
  const snap = await getDocs(query(collection(db, 'pedidos'), where('fecha', '==', today())));
  const pedidos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const activos = pedidos.filter((p) => p.estado !== 'cancelado');
  $('mPedidos').textContent = activos.length;
  $('mUnidades').textContent = activos.reduce((s,p) => s + (p.items || []).reduce((a,i) => a + Number(i.cantidad || 0), 0), 0);
  $('mTotal').textContent = money(activos.reduce((s,p) => s + Number(p.total || 0), 0));
  $('pedidosBody').innerHTML = '';
  if (!pedidos.length) $('pedidosBody').innerHTML = '<tr><td colspan="5">No hay pedidos hoy.</td></tr>';
  for (const p of pedidos) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${safe(p.compradorNombre)}</td><td>${safe((p.items || []).map(i => `${i.cantidad}× ${i.nombre}`).join(', '))}</td><td>${money(p.total)}</td><td><span class="pill">${safe(p.estado)}</span></td><td>${p.estado === 'confirmado' ? '<button class="btn secondary cancelar">Cancelar</button>' : ''}</td>`;
    if (p.estado === 'confirmado') {
      tr.querySelector('.cancelar').addEventListener('click', async () => {
        if (!confirm(`¿Cancelar el pedido de ${p.compradorNombre}? El valor dejará de contar en su saldo.`)) return;
        await updateDoc(doc(db, 'pedidos', p.id), { estado: 'cancelado', canceladoEn: serverTimestamp() });
        await refreshAll();
      });
    }
    $('pedidosBody').appendChild(tr);
  }
}

$('guardarPedido').addEventListener('click', async () => {
  msg($('pedidoMsg'), '');
  const cliente = clientesCache.find((c) => c.id === $('pedidoCliente').value);
  const plato = menuHoy[Number($('pedidoPlato').value)];
  const cantidad = Number($('pedidoCantidad').value || 1);
  if (!cliente || !plato || cantidad < 1) return msg($('pedidoMsg'), 'Selecciona cliente, plato y cantidad.', 'error');
  const total = Number((Number(plato.precio) * cantidad).toFixed(2));
  await addDoc(collection(db, 'pedidos'), {
    clienteId: cliente.id,
    compradorUid: cliente.uid || null,
    compradorNombre: cliente.nombre,
    fecha: today(),
    items: [{
      productoId: plato.id || plato.nombre,
      nombre: plato.nombre,
      cantidad,
      precioUnitario: Number(plato.precio),
      subtotal: total
    }],
    total,
    estado: 'confirmado',
    origen: $('pedidoOrigen').value,
    creadoPor: currentSeller.uid,
    creadoEn: serverTimestamp(),
    canceladoEn: null
  });
  $('pedidoCantidad').value = 1;
  msg($('pedidoMsg'), 'Pedido registrado.', 'success');
  await refreshAll();
});

async function loadCuentas() {
  const [pedSnap, paySnap] = await Promise.all([getDocs(collection(db, 'pedidos')), getDocs(collection(db, 'pagos'))]);
  const pedidos = pedSnap.docs.map((d) => d.data()).filter((p) => p.estado !== 'cancelado');
  const pagos = paySnap.docs.map((d) => d.data()).filter((p) => p.estado !== 'anulado');
  cuentasCache = clientesCache.map((c) => {
    const consumido = pedidos.filter((p) => p.clienteId === c.id).reduce((s,p) => s + Number(p.total || 0), 0);
    const pagado = pagos.filter((p) => p.clienteId === c.id).reduce((s,p) => s + Number(p.monto || 0), 0);
    return { ...c, consumido, pagado, saldo: consumido - pagado };
  }).sort((a,b) => b.saldo - a.saldo);
  renderCuentas();
}

function renderCuentas() {
  const q = $('buscarCuenta').value.trim().toLowerCase();
  const rows = cuentasCache.filter((c) => !q || c.nombre.toLowerCase().includes(q));
  $('cuentasBody').innerHTML = rows.map((r) => `<tr><td>${safe(r.nombre)}</td><td>${money(r.consumido)}</td><td>${money(r.pagado)}</td><td><strong>${money(r.saldo)}</strong></td></tr>`).join('') || '<tr><td colspan="4">Sin resultados.</td></tr>';
}
$('buscarCuenta').addEventListener('input', renderCuentas);

$('guardarPago').addEventListener('click', async () => {
  msg($('pagoMsg'), '');
  const cliente = clientesCache.find((c) => c.id === $('pagoCliente').value);
  const monto = Number($('pagoMonto').value || 0);
  if (!cliente || monto <= 0) return msg($('pagoMsg'), 'Selecciona cliente e ingresa un monto válido.', 'error');
  await addDoc(collection(db, 'pagos'), {
    clienteId: cliente.id,
    clienteUid: cliente.uid || null,
    clienteNombre: cliente.nombre,
    monto,
    metodo: $('pagoMetodo').value,
    estado: 'confirmado',
    comprobanteId: null,
    registradoPor: currentSeller.uid,
    creadoEn: serverTimestamp()
  });
  $('pagoMonto').value = '';
  msg($('pagoMsg'), 'Pago registrado correctamente.', 'success');
  await refreshAll();
});

async function loadComprobantes() {
  const snap = await getDocs(collection(db, 'comprobantes'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.estado === 'pendiente').sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
  $('comprobantesList').innerHTML = '';
  if (!docs.length) $('comprobantesList').innerHTML = '<p class="muted">No hay transferencias pendientes.</p>';
  for (const c of docs) {
    const box = document.createElement('div');
    box.className = 'card';
    box.innerHTML = `<div class="row"><div><strong>${safe(c.clienteNombre || '')}</strong><div class="muted">${money(c.montoDeclarado)} · ${safe(c.archivoNombre || '')}</div></div><div class="row"><a class="btn secondary" target="_blank" href="/api/comprobantes?key=${encodeURIComponent(c.r2Key || '')}">Ver</a><button class="btn primary aprobar">Aprobar</button><button class="btn secondary rechazar">Rechazar</button></div></div>`;
    box.querySelector('.aprobar').addEventListener('click', async () => {
      await updateDoc(doc(db, 'comprobantes', c.id), { estado: 'aprobado', revisadoEn: serverTimestamp(), revisadoPor: currentSeller.uid });
      await addDoc(collection(db, 'pagos'), {
        clienteId: c.clienteId,
        clienteUid: c.clienteUid || null,
        clienteNombre: c.clienteNombre,
        monto: Number(c.montoDeclarado || 0),
        metodo: 'transferencia',
        estado: 'confirmado',
        comprobanteId: c.id,
        registradoPor: currentSeller.uid,
        creadoEn: serverTimestamp()
      });
      await refreshAll();
    });
    box.querySelector('.rechazar').addEventListener('click', async () => {
      await updateDoc(doc(db, 'comprobantes', c.id), { estado: 'rechazado', revisadoEn: serverTimestamp(), revisadoPor: currentSeller.uid });
      await loadComprobantes();
    });
    $('comprobantesList').appendChild(box);
  }
}

async function refreshAll() {
  await Promise.all([loadClientes(), loadMenu()]);
  await Promise.all([loadPedidos(), loadCuentas(), loadComprobantes()]);
}
$('refreshBtn').addEventListener('click', refreshAll);
