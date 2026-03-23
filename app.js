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
const appSecundaria = initializeApp(firebaseConfig, "Secondary");
const authSecundaria = getAuth(appSecundaria);

let deudaGlobal = 0;
let estadoGlobal = "ACTIVO";
let rolUsuarioActual = "ESTANDAR";

// NAVEGACIÓN
const cambiarVista = (vista) => {
    const vPers = document.getElementById('vistaPersonal');
    const vGest = document.getElementById('vistaGestion');
    const vSecre = document.getElementById('vistaSecretario');
    const bPers = document.getElementById('btnNavPers');
    const bGest = document.getElementById('btnNavGest');
    const bSecre = document.getElementById('btnNavSecre');
    const fab = document.getElementById('btnNuevoRegistro');

    [vPers, vGest, vSecre].forEach(v => v && v.classList.add('d-none'));
    [bPers, bGest, bSecre].forEach(b => b && b.classList.remove('active'));
    if(fab) fab.classList.add('d-none');

    if (vista === 'personal') { vPers.classList.remove('d-none'); bPers.classList.add('active'); }
    else if (vista === 'gestion') { 
        vGest.classList.remove('d-none'); 
        bGest.classList.add('active'); 
        if(rolUsuarioActual === "ADMIN" && fab) fab.classList.remove('d-none'); 
    }
    else if (vista === 'secretario') { vSecre.classList.remove('d-none'); bSecre.classList.add('active'); }
};

document.getElementById('btnNavPers').addEventListener('click', () => cambiarVista('personal'));
document.getElementById('btnNavGest').addEventListener('click', () => cambiarVista('gestion'));
if(document.getElementById('btnNavSecre')) {
    document.getElementById('btnNavSecre').addEventListener('click', () => cambiarVista('secretario'));
}

// SESIÓN
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
            const d = snap.data();
            rolUsuarioActual = d.rol_app;

            let deuda = Number(d.deuda_total) || 0;
            const hoy = new Date();
            const anclaje = d.fecha_anclaje ? new Date(d.fecha_anclaje + "T00:00:00") : new Date(2026, 2, 1);
            let meses = ((hoy.getFullYear() - anclaje.getFullYear()) * 12) + (hoy.getMonth() - anclaje.getMonth());
            
            if (hoy.getDate() > 5 && meses > 0) {
                if (d.estado_membresia === "ACTIVO") deuda += 5;
                const nuevoEstado = deuda >= 20 ? "SUSPENDIDO" : "ACTIVO";
                await updateDoc(doc(db, "usuarios", user.uid), { 
                    deuda_total: deuda, 
                    estado_membresia: nuevoEstado, 
                    fecha_anclaje: hoy.toISOString().split('T')[0] 
                });
            }

            deudaGlobal = deuda;
            estadoGlobal = d.estado_membresia || "ACTIVO";

            document.getElementById('txtNombreUsuario').innerText = "Hola, " + d.nombre;
            document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
            
            configurarSelectorAnios();
            generarCalendario(deudaGlobal, estadoGlobal, document.getElementById('selectorAnio').value);

            if (["ADMIN", "TESORERO", "SECRETARIO", "DIRECTIVO"].includes(rolUsuarioActual)) {
                document.getElementById('navAdmin').classList.remove('d-none');
                cargarBalanceGlobal();
                cargarUsuarios();
                if (rolUsuarioActual === "ADMIN" || rolUsuarioActual === "TESORERO") {
                    document.getElementById('btnsTesorero').classList.remove('d-none');
                    prepararSelectCobro();
                }
                if (rolUsuarioActual === "ADMIN" || rolUsuarioActual === "SECRETARIO") {
                    const btnSecre = document.getElementById('btnNavSecre');
                    if(btnSecre) btnSecre.classList.remove('d-none');
                }
            }
        }
    } catch (e) { console.error("Error en sesión:", e); }
    document.getElementById('pantallaCarga').classList.add('d-none');
    document.getElementById('appContent').classList.remove('d-none');
});

function configurarSelectorAnios() {
    const selector = document.getElementById('selectorAnio');
    const anioActual = new Date().getFullYear();
    let anioInicio = anioActual <= 2026 ? 2024 : anioActual - 2;
    selector.innerHTML = "";
    for (let i = anioInicio; i <= anioInicio + 2; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.text = `Año ${i}`;
        if (i === anioActual) opt.selected = true;
        selector.appendChild(opt);
    }
}

function generarCalendario(deuda, estado, anioSel) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cont = document.getElementById('calendarioPagos');
    const hoy = new Date();
    const mesAct = hoy.getMonth();
    const anioAct = hoy.getFullYear();
    const anioInt = parseInt(anioSel);

    let cuotasPendientes = Math.floor(deuda / 5);
    cont.innerHTML = "";
    cont.className = "calendar-grid";

    meses.forEach((n, i) => {
        let clase = "month-future"; 
        let sub = "Próximo";
        const esPasadoOPresente = (anioInt < anioAct) || (anioInt === anioAct && i <= mesAct);

        if (esPasadoOPresente) {
            let antiguedad = ((anioAct - anioInt) * 12) + (mesAct - i);

            if (antiguedad < cuotasPendientes) {
                if (estado === "SUSPENDIDO") {
                    clase = "month-null"; sub = "Congelado"; n += " (X)";
                } else {
                    clase = "month-debt"; sub = "Pendiente";
                }
            } else {
                clase = "month-paid"; sub = "Al día";
            }

            if (anioInt === anioAct && i === mesAct && hoy.getDate() <= 5 && deuda < 20) {
                clase = "month-grace"; sub = "Gracia";
            }
        }

        cont.innerHTML += `<div class="month-card ${clase}"><div>${n}</div><div style="font-size:8px; opacity:0.7">${sub}</div></div>`;
    });
}

// LOGICA DE CAJA Y USUARIOS (REDUCIDA PARA ESTABILIDAD)
async function cargarBalanceGlobal() {
    try {
        const snap = await getDocs(collection(db, "usuarios"));
        let porC = 0, recApp = 0;
        snap.forEach(d => { 
            porC += (d.data().deuda_total || 0); 
            recApp += (d.data().acumulado_pagado || 0); 
        });
        const docFin = await getDoc(doc(db, "config", "finanzas"));
        let saldoI = docFin.exists() ? docFin.data().caja_inicial : 0;
        document.getElementById('totalEnCaja').innerText = "$" + (saldoI + recApp);
        document.getElementById('totalPorCobrar').innerText = "$" + porC;
    } catch (e) { console.log(e); }
}

async function cargarUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    const snap = await getDocs(collection(db, "usuarios"));
    lista.innerHTML = "";
    const puedeE = ["ADMIN", "TESORERO"].includes(rolUsuarioActual);
    snap.forEach(d => {
        const u = d.data();
        let btn = puedeE ? `<button class="btn btn-sm btn-outline-danger" onclick="window.abrirEditorManual('${d.id}', ${u.deuda_total})">Edit</button>` : "";
        lista.innerHTML += `<div class="miembro-card"><div><b>${u.nombre}</b><br><small>$${u.deuda_total} - ${u.estado_membresia}</small></div>${btn}</div>`;
    });
}

document.getElementById('btnCerrarSesion').addEventListener('click', () => signOut(auth).then(() => window.location.href = "index.html"));
document.getElementById('selectorAnio').addEventListener('change', (e) => generarCalendario(deudaGlobal, estadoGlobal, e.target.value));