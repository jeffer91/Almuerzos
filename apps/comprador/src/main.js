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

let currentBuyer = null;
let currentClient = null;
let menuHoy = [];
let cantidades = {};

function msg(el, text, type = 'notice') {
  el.innerHTML = text ? `<div class="notice ${type}">${safe(text)}</div>` : '';
}

async function requireBuyer(user) {
  const userSnap = await getDoc(doc(db, 'usuarios', user.uid));
  if (!userSnap.exists() || userSnap.data().rol !== 'comprador' || userSnap.data().activo !== true) {
    await signOut(auth);
    throw new Error('Esta cuenta no tiene acceso de comprador.');
  }
  currentBuyer = { uid: user.uid, ...userSnap.data() };
  const clienteId = currentBuyer.clienteId || user.uid;
  const clientSnap = await getDoc(doc(db, 'clientes', clienteId));
  if (!clientSnap.exists()) throw new Error('No existe la ficha del cliente.');
  currentClient = { id: clienteId, ...clientSnap.data() };
  $('loginView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('buyerName').textContent = currentBuyer.nombre || currentClient.nombre;
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
    currentBuyer = null;
    currentClient = null;
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    return;
  }
  try { await requireBuyer(user); } catch (e) { msg($('loginMsg'), e.message, 'error'); }
});

for (const btn of document.querySelectorAll('#tabs button')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    $(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
}

function cartTotal() {
  return menuHoy.reduce((sum, p, i) => sum + Number(p.precio || 0) * Number(cantidades[i] || 0), 0);
}

function renderMenu() {
  $('menuList').innerHTML = '';
  if (!menuHoy.length) {
    $('menuList').innerHTML = '<p class="muted">Todavía no hay menú publicado para hoy.</p>';
    $('confirmarPedido').disabled = true;
    $('cartTotal').textContent = money(0);
    return;
  }
  $('confirmarPedido').disabled = false;
  menuHoy.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'menu-item';
    row.innerHTML = `<div><h3>${safe(p.nombre)}</h3><div class="muted">${safe(p.descripcion || '')}</div><strong>${money(p.precio)}</strong></div><div class="qty"><button class="menos" aria-label="Restar">−</button><strong class="cantidad">${cantidades[i] || 0}</strong><button class="mas" aria-label="Sumar">+</button></div>`;
    row.querySelector('.menos').addEventListener('click', () => {
      cantidades[i] = Math.max(0, Number(cantidades[i] || 0) - 1);
      renderMenu();
    });
    row.querySelector('.mas').addEventListener('click', () => {
      cantidades[i] = Number(cantidades[i] || 0) + 1;
      renderMenu();
    });
    $('menuList').appendChild(row);
  });
  $('cartTotal').textContent = money(cartTotal());
}

async function loadMenu() {
  const snap = await getDoc(doc(db, 'menus', today()));
  menuHoy = snap.exists() && snap.data().activo !== false ? (snap.data().opciones || []).filter((x) => x.disponible !== false) : [];
  cantidades = {};
  renderMenu();
}

$('confirmarPedido').addEventListener('click', async () => {
  msg($('pedidoMsg'), '');
  const items = menuHoy.map((p, i) => {
    const cantidad = Number(cantidades[i] || 0);
    const precio = Number(p.precio || 0);
    return cantidad > 0 ? {
      productoId: p.id || p.nombre,
      nombre: p.nombre,
      cantidad,
      precioUnitario: precio,
      subtotal: Number((cantidad * precio).toFixed(2))
    } : null;
  }).filter(Boolean);
  if (!items.length) return msg($('pedidoMsg'), 'Selecciona al menos un almuerzo.', 'error');
  const total = Number(items.reduce((s,i) => s + i.subtotal, 0).toFixed(2));
  try {
    await addDoc(collection(db, 'pedidos'), {
      clienteId: currentClient.id,
      compradorUid: currentBuyer.uid,
      compradorNombre: currentClient.nombre,
      fecha: today(),
      items,
      total,
      estado: 'confirmado',
      origen: 'comprador',
      creadoPor: currentBuyer.uid,
      creadoEn: serverTimestamp(),
      canceladoEn: null
    });
    cantidades = {};
    renderMenu();
    msg($('pedidoMsg'), `Pedido confirmado por ${money(total)}.`, 'success');
    await loadAccountAndOrders();
  } catch (e) {
    msg($('pedidoMsg'), 'No se pudo registrar el pedido.', 'error');
  }
});

async function loadAccountAndOrders() {
  const [pedSnap, paySnap] = await Promise.all([
    getDocs(query(collection(db, 'pedidos'), where('compradorUid', '==', currentBuyer.uid))),
    getDocs(query(collection(db, 'pagos'), where('clienteUid', '==', currentBuyer.uid)))
  ]);
  const pedidos = pedSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
  const pagos = paySnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.estado !== 'anulado');
  const consumido = pedidos.filter((p) => p.estado !== 'cancelado').reduce((s,p) => s + Number(p.total || 0), 0);
  const pagado = pagos.reduce((s,p) => s + Number(p.monto || 0), 0);
  const saldo = consumido - pagado;
  $('mConsumido').textContent = money(consumido);
  $('mPagado').textContent = money(pagado);
  $('mSaldo').textContent = saldo >= 0 ? money(saldo) : `${money(Math.abs(saldo))} a favor`;
  $('pedidosList').innerHTML = '';
  if (!pedidos.length) $('pedidosList').innerHTML = '<p class="muted">Todavía no tienes pedidos.</p>';
  for (const p of pedidos) {
    const box = document.createElement('div');
    box.className = 'order-card';
    box.innerHTML = `<div class="row"><div><strong>${safe(p.fecha)}</strong><div>${safe((p.items || []).map(i => `${i.cantidad}× ${i.nombre}`).join(', '))}</div><div class="muted">${money(p.total)} · ${safe(p.estado)}</div></div>${p.estado === 'confirmado' && p.fecha === today() ? '<button class="btn secondary cancelar">Cancelar</button>' : ''}</div>`;
    const cancelBtn = box.querySelector('.cancelar');
    if (cancelBtn) cancelBtn.addEventListener('click', async () => {
      if (!confirm('¿Cancelar este pedido? El valor dejará de contar en tu saldo.')) return;
      try {
        await updateDoc(doc(db, 'pedidos', p.id), { estado: 'cancelado', canceladoEn: serverTimestamp() });
        await loadAccountAndOrders();
      } catch {
        alert('No se pudo cancelar el pedido.');
      }
    });
    $('pedidosList').appendChild(box);
  }
}

$('subirTransferencia').addEventListener('click', async () => {
  msg($('transferMsg'), '');
  const monto = Number($('transferMonto').value || 0);
  const file = $('transferFile').files?.[0];
  if (monto <= 0 || !file) return msg($('transferMsg'), 'Ingresa el monto y selecciona el comprobante.', 'error');
  if (file.size > 5 * 1024 * 1024) return msg($('transferMsg'), 'El archivo no puede superar 5 MB.', 'error');
  try {
    const token = await auth.currentUser.getIdToken();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/comprobantes', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const uploaded = await res.json();
    if (!res.ok) throw new Error(uploaded.error || 'No se pudo subir el archivo.');
    await addDoc(collection(db, 'comprobantes'), {
      clienteId: currentClient.id,
      clienteUid: currentBuyer.uid,
      clienteNombre: currentClient.nombre,
      montoDeclarado: monto,
      r2Key: uploaded.key,
      archivoNombre: file.name,
      estado: 'pendiente',
      creadoEn: serverTimestamp(),
      revisadoEn: null,
      revisadoPor: null
    });
    $('transferMonto').value = '';
    $('transferFile').value = '';
    msg($('transferMsg'), 'Comprobante enviado. Queda pendiente de revisión.', 'success');
    await loadComprobantes();
  } catch (e) {
    msg($('transferMsg'), e.message, 'error');
  }
});

async function loadComprobantes() {
  const snap = await getDocs(query(collection(db, 'comprobantes'), where('clienteUid', '==', currentBuyer.uid)));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a,b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
  $('comprobantesList').innerHTML = docs.map((c) => `<div class="order-card"><div class="row"><div><strong>${money(c.montoDeclarado)}</strong><div class="muted">${safe(c.archivoNombre)} · ${safe(c.estado)}</div></div><a class="btn secondary" target="_blank" href="/api/comprobantes?key=${encodeURIComponent(c.r2Key || '')}">Ver</a></div></div>`).join('') || '<p class="muted">No has enviado comprobantes.</p>';
}

async function refreshAll() {
  await Promise.all([loadMenu(), loadAccountAndOrders(), loadComprobantes()]);
}
