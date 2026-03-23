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

// --- LOGIN ---
if(document.getElementById('formLogin')) {
    document.getElementById('formLogin').onsubmit = (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnLogin');
        btn.innerText = "Verificando..."; btn.disabled = true;
        signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('pass').value)
            .then(() => window.location.href = "dashboard.html")
            .catch(() => { alert("Error de acceso"); btn.innerText = "ENTRAR"; btn.disabled = false; });
    };
}

// --- NAVEGACIÓN GLOBAL ---
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

// --- CONTROL DE SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { if(!window.location.href.includes("index.html")) window.location.href = "index.html"; return; }
    if (window.location.href.includes("dashboard.html")) {
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
        document.getElementById('pantallaCarga').classList.add('d-none');
        document.getElementById('appContent').classList.remove('d-none');
    }
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
        const anioInt = parseInt(anioSel);
        const esPasado = (anioInt < hoy.getFullYear()) || (anioInt === hoy.getFullYear() && i <= hoy.getMonth());

        if (esPasado) {
            let dist = ((hoy.getFullYear() - anioInt) * 12) + (hoy.getMonth() - i);
            if (dist < cuotas) {
                clase = estado === "SUSPENDIDO" ? "month-null" : "month-debt";
                sub = "Debe"; if(estado === "SUSPENDIDO") n += " (X)";
            } else {
                clase = "month-paid"; sub = "Al día";
            }
        }
        cont.innerHTML += `<div class="month-card ${clase}"><div>${n}</div><div style="font-size:8px; opacity:0.7">${sub}</div></div>`;
    });
};

// --- RESTO DE FUNCIONES (CAJA, EDITAR, SALIR) ---
window.abrirEditorManual = (id, deuda) => {
    const n = prompt("Nuevo saldo de deuda $:", deuda);
    if (n !== null) {
        updateDoc(doc(db, "usuarios", id), { deuda_total: Number(n), estado_membresia: Number(n) >= 20 ? "SUSPENDIDO" : "ACTIVO" }).then(() => location.reload());
    }
};

window.cerrarSesion = () => signOut(auth);

// [Aquí mantén tus funciones de cargarBalanceGlobal, cargarUsuarios y prepararSelectCobro sin cambios]