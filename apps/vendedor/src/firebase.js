import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyDcfDlewRojniHwrW_6bn6fQXEfHiXb7yg',
  authDomain: 'almacen-65966.firebaseapp.com',
  projectId: 'almacen-65966',
  storageBucket: 'almacen-65966.firebasestorage.app',
  messagingSenderId: '408513616601',
  appId: '1:408513616601:web:25540aa294649ee67abcc8',
  measurementId: 'G-YK1NLF91PL'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function normalizarNombre(nombre = '') {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

export function emailTecnico(nombre) {
  return `${normalizarNombre(nombre)}@pimentonrojo.local`;
}
