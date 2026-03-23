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

    [vPers, vGest, vSecre].forEach(v => v.classList.add('d-none'));
    [bPers, bGest, bSecre].forEach(b => b.classList.remove('active'));
    fab.classList.add('d-none');

    if (vista === 'personal') { vPers.classList.remove('d-none'); bPers.classList.add('active'); }
    else if (vista === 'gestion') { 
        vGest.classList.remove('d-none'); 
        bGest.classList.add('active'); 
        if(rolUsuarioActual === "ADMIN") fab.classList.remove('d-none'); 
    }
    else if (vista === 'secretario') { vSecre.classList.remove('d-none'); bSecre.classList.add('active'); }
};

document.getElementById('btnNavPers').addEventListener('click', () => cambiarVista('personal'));
document.getElementById('btnNavGest').addEventListener('click', () => cambiarVista('gestion'));
document.getElementById('btnNavSecre').addEventListener('click', () => cambiarVista('secretario'));

// SESIÓN
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
            const d = snap.data();
            rolUsuarioActual = d.rol_app;

            // Lógica de Deuda Automática
            let deuda = Number(d.deuda_total) || 0;
            const hoy = new Date();
            const anclaje = d.fecha_anclaje ? new Date(d.fecha_anclaje + "T00:00:00") : new Date(2026, 2, 1);
            let meses = ((hoy.getFullYear() - anclaje.getFullYear()) * 12) + (hoy.getMonth() - anclaje.getMonth());
            if (hoy.getDate() <= 5 && meses > 0) meses--;
            
            let dCalc = deuda;
            if (meses > 0 && d.estado_membresia === "ACTIVO") dCalc += (meses * 5);
            let est = dCalc >= 20 ? "SUSPENDIDO" : "ACTIVO";

            if (meses > 0 || est !== d.estado_membresia) {
                await updateDoc(doc(db, "usuarios", user.uid), { deuda_total: dCalc, estado_membresia: est, fecha_anclaje: hoy.toISOString().split('T')[0] });
            }

            deudaGlobal = dCalc; estadoGlobal = est;
            document.getElementById('txtNombreUsuario').innerText = "Hola, " + d.nombre;
            document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
            
            // Iniciar Calendario
            configurarSelectorAnios();
            generarCalendario(deudaGlobal, estadoGlobal, document.getElementById('selectorAnio').value);

            // Permisos Directiva
            if (["ADMIN", "TESORERO", "SECRETARIO", "DIRECTIVO"].includes(rolUsuarioActual)) {
                document.getElementById('navAdmin').classList.remove('d-none');
                cargarBalanceGlobal();
                cargarUsuarios();
                if (rolUsuarioActual === "ADMIN" || rolUsuarioActual === "TESORERO") {
                    document.getElementById('btnsTesorero').classList.remove('d-none');
                    prepararSelectCobro();
                }
                if (rolUsuarioActual === "ADMIN" || rolUsuarioActual === "SECRETARIO") {
                    document.getElementById('btnNavSecre').classList.remove('d-none');
                }
            }
        }
    } catch (e) { console.error(e); }
    document.getElementById('pantallaCarga').classList.add('d-none');
    document.getElementById('appContent').classList.remove('d-none');
});

// AÑOS DINÁMICOS (Bloques de 3 años)
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

// CALENDARIO GRID
function generarCalendario(deuda, estado, anio) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cont = document.getElementById('calendarioPagos');
    const hoy = new Date();
    const anioAct = hoy.getFullYear();
    const mesAct = hoy.getMonth();
    const anioSel = parseInt(anio);
    
    let mD = Math.floor(deuda / 5);
    cont.innerHTML = "";
    cont.className = "calendar-grid";

    meses.forEach((n, i) => {
        let clase = "month-future"; let sub = "Próximo";
        if (anioSel < anioAct || (anioSel === anioAct && i <= mesAct)) {
            let diff = ((anioAct - anioSel) * 12) + (mesAct - i);
            if (anioSel === anioAct && i === mesAct && hoy.getDate() <= 5) { clase = "month-grace"; sub = "Gracia"; }
            else if (diff < mD) { clase = "month-debt"; sub = "Pagar"; }
            else if (estado === "SUSPENDIDO" && diff >= mD) { clase = "month-null"; sub = "Nulo"; n += " (X)"; }
            else { clase = "month-paid"; sub = "Al día"; }
        }
        cont.innerHTML += `<div class="month-card ${clase}"><div>${n}</div><div style="font-size:8px; opacity:0.7">${sub}</div></div>`;
    });
}

// [MANTENER AQUÍ EL RESTO DE TUS FUNCIONES: cargarBalanceGlobal, cargarUsuarios, registrarPago, etc.]

document.getElementById('selectorAnio').addEventListener('change', (e) => generarCalendario(deudaGlobal, estadoGlobal, e.target.value));
document.getElementById('btnCerrarSesion').addEventListener('click', () => signOut(auth).then(() => window.location.href = "index.html"));