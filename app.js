import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

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

// --- CAMBIAR VISTAS (Funciona con Event Listeners ahora) ---
const cambiarVista = (vista) => {
    const vPers = document.getElementById('vistaPersonal');
    const vGest = document.getElementById('vistaGestion');
    const bPers = document.getElementById('btnNavPers');
    const bGest = document.getElementById('btnNavGest');
    const fab = document.getElementById('btnNuevoRegistro');

    if (vista === 'personal') {
        vPers.classList.remove('d-none'); vGest.classList.add('d-none');
        bPers.classList.add('active'); bGest.classList.remove('active');
        fab.classList.add('d-none');
    } else {
        vPers.classList.add('d-none'); vGest.classList.remove('d-none');
        bPers.classList.remove('active'); bGest.classList.add('active');
        if (rolUsuarioActual === "ADMIN") fab.classList.remove('d-none');
    }
};

document.getElementById('btnNavPers').addEventListener('click', () => cambiarVista('personal'));
document.getElementById('btnNavGest').addEventListener('click', () => cambiarVista('gestion'));

// --- LOGOUT ---
document.getElementById('btnCerrarSesion').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

// --- SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
            const d = snap.data();
            rolUsuarioActual = d.rol_app;
            
            // Lógica de Deuda
            let deuda = Number(d.deuda_total) || 0;
            const hoy = new Date();
            const anclaje = d.fecha_anclaje ? new Date(d.fecha_anclaje + "T00:00:00") : new Date(2026, 2, 1);
            let meses = ((hoy.getFullYear() - anclaje.getFullYear()) * 12) + (hoy.getMonth() - anclaje.getMonth());
            if (hoy.getDate() <= 5 && meses > 0) meses--;
            if (meses < 0) meses = 0;

            let deudaCalc = deuda + (meses * (d.estado_membresia === "SUSPENDIDO" ? 0 : 5));
            let estado = d.estado_membresia || "ACTIVO";
            if (deudaCalc >= 20) { deudaCalc = 20; estado = "SUSPENDIDO"; }

            if (meses > 0 || estado !== d.estado_membresia) {
                await updateDoc(doc(db, "usuarios", user.uid), { deuda_total: deudaCalc, estado_membresia: estado, fecha_anclaje: hoy.toISOString().split('T')[0] });
            }

            deudaGlobal = deudaCalc; estadoGlobal = estado;

            document.getElementById('txtNombreUsuario').innerText = "Hola, " + d.nombre;
            document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
            generarCalendario(deudaGlobal, estadoGlobal, "2026");

            if (rolUsuarioActual === "ADMIN" || d.rango_mg === "Tesorero") {
                document.getElementById('navAdmin').classList.remove('d-none');
                cargarUsuarios();
                prepararSelectCobro();
            }
        }
    } catch (e) { console.error(e); }
    document.getElementById('pantallaCarga').classList.add('d-none');
    document.getElementById('appContent').classList.remove('d-none');
});

// --- SELECTOR DE AÑO ---
document.getElementById('selectorAnio').addEventListener('change', (e) => {
    generarCalendario(deudaGlobal, estadoGlobal, e.target.value);
});

// --- FUNCIONES CALENDARIO Y GESTIÓN (IDÉNTICAS A LAS ANTERIORES) ---
function generarCalendario(deuda, estado, anio) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cont = document.getElementById('calendarioPagos');
    const hoy = new Date();
    let mDeuda = Math.floor(deuda / 5);
    cont.innerHTML = "";
    meses.forEach((n, i) => {
        let color = "bg-secondary text-muted";
        let est = "";
        if (parseInt(anio) < hoy.getFullYear() || (parseInt(anio) === hoy.getFullYear() && i <= hoy.getMonth())) {
            let diff = ((hoy.getFullYear() - parseInt(anio)) * 12) + (hoy.getMonth() - i);
            if (diff < mDeuda) color = estado === "SUSPENDIDO" ? "bg-dark text-white" : "bg-danger text-white";
            else color = "bg-success text-white";
            if (estado === "SUSPENDIDO" && diff >= mDeuda) { est = "opacity: 0.5;"; n += " (X)"; }
        }
        cont.innerHTML += `<div class="col-3"><div class="p-2 rounded small fw-bold ${color}" style="${est}">${n}</div></div>`;
    });
}

async function cargarUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    const snap = await getDocs(collection(db, "usuarios"));
    lista.innerHTML = "";
    snap.forEach(d => {
        const u = d.data();
        lista.innerHTML += `<div class="miembro-card"><div><b>${u.nombre}</b><br><small>$${u.deuda_total} - ${u.estado_membresia}</small></div></div>`;
    });
}

async function prepararSelectCobro() {
    const select = document.getElementById('selectCobroMiembro');
    const snap = await getDocs(collection(db, "usuarios"));
    select.innerHTML = '<option value="">Seleccione...</option>';
    snap.forEach(d => { select.innerHTML += `<option value="${d.id}">${d.data().nombre}</option>`; });
}

// --- SUBMIT DE PAGOS Y REGISTRO ---
document.getElementById('formRegistrarPago').addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('selectCobroMiembro').value;
    const monto = Number(document.getElementById('montoPago').value);
    const ref = doc(db, "usuarios", uid);
    const d = (await getDoc(ref)).data();
    let nueva = (d.deuda_total || 0) - monto; if (nueva < 0) nueva = 0;
    await updateDoc(ref, { deuda_total: nueva, estado_membresia: nueva >= 20 ? "SUSPENDIDO" : "ACTIVO", fecha_anclaje: new Date().toISOString().split('T')[0] });
    location.reload();
});

document.getElementById('formNuevoMiembro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = await createUserWithEmailAndPassword(authSecundaria, document.getElementById('nuevoEmail').value, document.getElementById('nuevoPass').value);
    await setDoc(doc(db, "usuarios", u.user.uid), {
        nombre: document.getElementById('nuevoNombre').value,
        email: document.getElementById('nuevoEmail').value,
        rango_mg: document.getElementById('nuevoRango').value,
        rol_app: document.getElementById('nuevoRol').value,
        deuda_total: 0, estado_membresia: "ACTIVO", fecha_anclaje: new Date().toISOString().split('T')[0]
    });
    await signOut(authSecundaria);
    location.reload();
});
