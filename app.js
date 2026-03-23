import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
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

let deudaGlobal = 0, estadoGlobal = "ACTIVO", rolUsuarioActual = "ESTANDAR";

// LOGIN (RECONECTADO)
if (document.getElementById('formLogin')) {
    document.getElementById('formLogin').addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnLogin');
        btn.innerText = "Entrando..."; btn.disabled = true;
        signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('pass').value)
            .then(() => window.location.href = "dashboard.html")
            .catch(() => { alert("Acceso denegado"); btn.innerText = "ENTRAR"; btn.disabled = false; });
    });
}

// SESIÓN Y NAVEGACIÓN
onAuthStateChanged(auth, async (user) => {
    if (!user) { if(!window.location.href.includes("index.html")) window.location.href = "index.html"; return; }
    if (window.location.href.includes("dashboard.html")) {
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
    }
});

// CALENDARIO (Lógica de Verdes para meses pasados)
function generarCalendario(deuda, estado, anioSel) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cont = document.getElementById('calendarioPagos');
    const hoy = new Date(), mesAct = hoy.getMonth(), anioAct = hoy.getFullYear();
    let cuotasDeuda = Math.floor(deuda / 5);

    cont.innerHTML = "";
    meses.forEach((n, i) => {
        let clase = "month-future", sub = "Próximo";
        const anioInt = parseInt(anioSel);
        const esPasadoOPresente = (anioInt < anioAct) || (anioInt === anioAct && i <= mesAct);

        if (esPasadoOPresente) {
            let antiguedad = ((anioAct - anioInt) * 12) + (mesAct - i);
            if (antiguedad < cuotasDeuda) {
                clase = estado === "SUSPENDIDO" ? "month-null" : "month-debt";
                sub = "Debe"; n += (estado === "SUSPENDIDO" ? " (X)" : "");
            } else {
                clase = "month-paid"; sub = "Al día";
            }
        }
        cont.innerHTML += `<div class="month-card ${clase}"><div>${n}</div><div style="font-size:8px; opacity:0.7">${sub}</div></div>`;
    });
}

// ACCIONES DE CAJA
async function cargarBalanceGlobal() {
    const snap = await getDocs(collection(db, "usuarios"));
    let porC = 0, rec = 0;
    snap.forEach(d => { porC += (d.data().deuda_total || 0); rec += (d.data().acumulado_pagado || 0); });
    const conf = await getDoc(doc(db, "config", "finanzas"));
    let ini = conf.exists() ? conf.data().caja_inicial : 0;
    document.getElementById('totalEnCaja').innerText = "$" + (rec + ini);
    document.getElementById('totalPorCobrar').innerText = "$" + porC;
}

if(document.getElementById('formRegistrarPago')) {
    document.getElementById('formRegistrarPago').onsubmit = async (e) => {
        e.preventDefault();
        const uid = document.getElementById('selectCobroMiembro').value;
        const monto = Number(document.getElementById('montoPago').value);
        const uRef = doc(db, "usuarios", uid);
        const uSnap = await getDoc(uRef);
        const uData = uSnap.data();

        let nD = Math.max(0, (uData.deuda_total || 0) - monto);
        let nA = (uData.acumulado_pagado || 0) + monto;

        await updateDoc(uRef, { deuda_total: nD, acumulado_pagado: nA, estado_membresia: nD >= 20 ? "SUSPENDIDO" : "ACTIVO" });
        await addDoc(collection(db, "finanzas"), { fecha: new Date().toISOString(), nombre: uData.nombre, monto: monto });
        location.reload();
    };
}

// SELECTORES Y NAVEGACIÓN
window.abrirEditorManual = (uid, deuda) => {
    document.getElementById('editUid').value = uid;
    document.getElementById('nuevoMontoManual').value = deuda;
    new bootstrap.Modal(document.getElementById('modalEditarSaldo')).show();
};

if(document.getElementById('formEditarSaldo')) {
    document.getElementById('formEditarSaldo').onsubmit = async (e) => {
        e.preventDefault();
        const uid = document.getElementById('editUid').value;
        const monto = Number(document.getElementById('nuevoMontoManual').value);
        await updateDoc(doc(db, "usuarios", uid), { deuda_total: monto, estado_membresia: monto >= 20 ? "SUSPENDIDO" : "ACTIVO" });
        location.reload();
    };
}

if(document.getElementById('formCajaInicial')) {
    document.getElementById('formCajaInicial').onsubmit = async (e) => {
        e.preventDefault();
        await setDoc(doc(db, "config", "finanzas"), { caja_inicial: Number(document.getElementById('montoCajaInicial').value) }, { merge: true });
        location.reload();
    };
}

function configurarSelectorAnios() {
    const s = document.getElementById('selectorAnio');
    if(!s) return;
    const act = new Date().getFullYear();
    s.innerHTML = "";
    for(let i=2024; i<=act; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.text = "Año " + i;
        if(i === act) opt.selected = true;
        s.appendChild(opt);
    }
}

async function cargarUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    if(!lista) return;
    const snap = await getDocs(collection(db, "usuarios"));
    lista.innerHTML = "";
    snap.forEach(d => {
        const u = d.data();
        lista.innerHTML += `<div class="miembro-card"><div><b>${u.nombre}</b><br><small>$${u.deuda_total} - ${u.estado_membresia}</small></div>
            <button class="btn btn-sm btn-outline-danger" onclick="abrirEditorManual('${d.id}', ${u.deuda_total})">Edit</button></div>`;
    });
}

async function prepararSelectCobro() {
    const s = document.getElementById('selectCobroMiembro');
    if(!s) return;
    const snap = await getDocs(collection(db, "usuarios"));
    s.innerHTML = '<option value="">Seleccionar Miembro...</option>';
    snap.forEach(d => { s.appendChild(new Option(d.data().nombre, d.id)); });
}

if(document.getElementById('btnCerrarSesion')) document.getElementById('btnCerrarSesion').onclick = () => signOut(auth);
if(document.getElementById('btnNavPers')) document.getElementById('btnNavPers').onclick = () => {
    document.getElementById('vistaPersonal').classList.remove('d-none');
    document.getElementById('vistaGestion').classList.add('d-none');
};
if(document.getElementById('btnNavGest')) document.getElementById('btnNavGest').onclick = () => {
    document.getElementById('vistaPersonal').classList.add('d-none');
    document.getElementById('vistaGestion').classList.remove('d-none');
};