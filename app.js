import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, setDoc, addDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCEX-TTUzHwBzmfOqfG1R7C-0n5kVPGXh4",
    authDomain: "sistema-mda.firebaseapp.com",
    projectId: "sistema-mda",
    storageBucket: "sistema-mda.firebasestorage.app",
    messagingSenderId: "209728856018",
    appId: "1:209728856018:web:41f93f7c63b0e10a17720b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const authSec = getAuth(initializeApp(firebaseConfig, "Secondary"));

let deudaGlobal = 0;
let estadoGlobal = "ACTIVO";
let rolUsuarioActual = "ESTANDAR";

// --- NAVEGACIÓN ---
window.cambiarVista = (vista) => {
    document.getElementById('vistaPersonal').classList.add('d-none');
    document.getElementById('vistaGestion').classList.add('d-none');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    if (vista === 'personal') {
        document.getElementById('vistaPersonal').classList.remove('d-none');
        document.getElementById('btnNavPers').classList.add('active');
    } else {
        document.getElementById('vistaGestion').classList.remove('d-none');
        document.getElementById('btnNavGest').classList.add('active');
    }
};

document.getElementById('btnNavPers').onclick = () => cambiarVista('personal');
document.getElementById('btnNavGest').onclick = () => cambiarVista('gestion');

// --- SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
            const d = snap.data();
            rolUsuarioActual = d.rol_app;
            deudaGlobal = d.deuda_total || 0;
            estadoGlobal = d.estado_membresia || "ACTIVO";

            document.getElementById('txtNombreUsuario').innerText = "Hola, " + d.nombre;
            document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
            
            configurarSelectorAnios();
            generarCalendario(deudaGlobal, estadoGlobal, document.getElementById('selectorAnio').value);

            if (["ADMIN", "TESORERO", "SECRETARIO"].includes(rolUsuarioActual)) {
                document.getElementById('navAdmin').classList.remove('d-none');
                cargarBalanceGlobal();
                cargarUsuarios();
                if (["ADMIN", "TESORERO"].includes(rolUsuarioActual)) {
                    document.getElementById('btnsTesorero').classList.remove('d-none');
                    prepararSelectCobro();
                }
            }
        }
    } catch (e) { console.error(e); }
    document.getElementById('pantallaCarga').classList.add('d-none');
    document.getElementById('appContent').classList.remove('d-none');
});

// --- LÓGICA DE CALENDARIO ---
window.generarCalendario = (deuda, estado, anioSel) => {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cont = document.getElementById('calendarioPagos');
    const hoy = new Date();
    const cuotas = Math.floor(deuda / 5);

    cont.innerHTML = "";
    meses.forEach((n, i) => {
        let clase = "month-future", sub = "Próximo";
        const esPasado = (parseInt(anioSel) < hoy.getFullYear()) || (parseInt(anioSel) === hoy.getFullYear() && i <= hoy.getMonth());

        if (esPasado) {
            let dist = ((hoy.getFullYear() - parseInt(anioSel)) * 12) + (hoy.getMonth() - i);
            if (dist < cuotas) {
                clase = estado === "SUSPENDIDO" ? "month-null" : "month-debt";
                sub = "Debe";
            } else {
                clase = "month-paid"; sub = "Al día";
            }
        }
        cont.innerHTML += `<div class="month-card ${clase}"><div>${n}</div><div style="font-size:8px; opacity:0.7">${sub}</div></div>`;
    });
};

// --- ACCIONES DE CAJA ---
async function cargarBalanceGlobal() {
    const snap = await getDocs(collection(db, "usuarios"));
    let pC = 0, rec = 0;
    snap.forEach(d => { pC += d.data().deuda_total; rec += d.data().acumulado_pagado; });
    const conf = await getDoc(doc(db, "config", "finanzas"));
    let ini = conf.exists() ? conf.data().caja_inicial : 0;
    document.getElementById('totalEnCaja').innerText = "$" + (rec + ini);
    document.getElementById('totalPorCobrar').innerText = "$" + pC;
}

document.getElementById('formRegistrarPago').onsubmit = async (e) => {
    e.preventDefault();
    const uid = document.getElementById('selectCobroMiembro').value;
    const monto = Number(document.getElementById('montoPago').value);
    const uRef = doc(db, "usuarios", uid);
    const uData = (await getDoc(uRef)).data();

    let nD = Math.max(0, uData.deuda_total - monto);
    await updateDoc(uRef, { deuda_total: nD, acumulado_pagado: uData.acumulado_pagado + monto, estado_membresia: nD >= 20 ? "SUSPENDIDO" : "ACTIVO" });
    await addDoc(collection(db, "finanzas"), { fecha: new Date().toISOString(), nombre: uData.nombre, monto: monto });
    location.reload();
};

// --- HELPERS ---
function configurarSelectorAnios() {
    const s = document.getElementById('selectorAnio');
    const act = new Date().getFullYear();
    s.innerHTML = `<option value="${act-1}">${act-1}</option><option value="${act}" selected>${act}</option>`;
    s.onchange = (e) => generarCalendario(deudaGlobal, estadoGlobal, e.target.value);
}

async function cargarUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    const snap = await getDocs(collection(db, "usuarios"));
    lista.innerHTML = "";
    snap.forEach(d => {
        const u = d.data();
        lista.innerHTML += `<div class="miembro-card">
            <div><b>${u.nombre}</b><br><small>$${u.deuda_total} - ${u.estado_membresia}</small></div>
            <button class="btn btn-sm btn-outline-danger" onclick="window.abrirEdicion('${d.id}', ${u.deuda_total})">Edit</button>
        </div>`;
    });
}

window.abrirEdicion = (id, deuda) => {
    const n = prompt("Nuevo saldo $:", deuda);
    if (n !== null) {
        updateDoc(doc(db, "usuarios", id), { deuda_total: Number(n), estado_membresia: Number(n) >= 20 ? "SUSPENDIDO" : "ACTIVO" }).then(() => location.reload());
    }
};

async function prepararSelectCobro() {
    const s = document.getElementById('selectCobroMiembro');
    const snap = await getDocs(collection(db, "usuarios"));
    s.innerHTML = '<option value="">Miembro...</option>';
    snap.forEach(d => { s.innerHTML += `<option value="${d.id}">${d.data().nombre}</option>`; });
}

document.getElementById('btnCerrarSesion').onclick = () => signOut(auth).then(() => window.location.href="index.html");