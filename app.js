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

// --- NAVEGACIÓN DE VISTAS ---
const cambiarVista = (vista) => {
    const vPers = document.getElementById('vistaPersonal');
    const vGest = document.getElementById('vistaGestion');
    const vSecre = document.getElementById('vistaSecretario');
    const bPers = document.getElementById('btnNavPers');
    const bGest = document.getElementById('btnNavGest');
    const bSecre = document.getElementById('btnNavSecre');
    const fab = document.getElementById('btnNuevoRegistro');

    // Resetear todo
    [vPers, vGest, vSecre].forEach(v => v.classList.add('d-none'));
    [bPers, bGest, bSecre].forEach(b => b.classList.remove('active'));
    fab.classList.add('d-none');

    if (vista === 'personal') {
        vPers.classList.remove('d-none');
        bPers.classList.add('active');
    } else if (vista === 'gestion') {
        vGest.classList.remove('d-none');
        bGest.classList.add('active');
        if (rolUsuarioActual === "ADMIN") fab.classList.remove('d-none');
    } else if (vista === 'secretario') {
        vSecre.classList.remove('d-none');
        bSecre.classList.add('active');
    }
};

// Listeners para la barra inferior
document.getElementById('btnNavPers').addEventListener('click', () => cambiarVista('personal'));
document.getElementById('btnNavGest').addEventListener('click', () => cambiarVista('gestion'));
document.getElementById('btnNavSecre').addEventListener('click', () => cambiarVista('secretario'));

// --- SALIR ---
document.getElementById('btnCerrarSesion').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

// --- SESIÓN Y CARGA ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
            const d = snap.data();
            rolUsuarioActual = d.rol_app;

            // Lógica de Deuda (Mantenemos tu lógica intacta)
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
            document.getElementById('txtNombreUsuario').innerText = "Hola, " + (d.nombre || "Hermano");
            document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
            document.getElementById('txtRolMenu').innerText = d.rol_app;

            generarCalendario(deudaGlobal, estadoGlobal, "2026");

            // Permisos de Barra
            if (["ADMIN", "TESORERO", "SECRETARIO", "DIRECTIVO"].includes(rolUsuarioActual)) {
                document.getElementById('navAdmin').classList.remove('d-none');
                if (rolUsuarioActual === "ADMIN" || rolUsuarioActual === "TESORERO") {
                    cargarUsuarios(); // Carga la lista en Gestión
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

// --- SELECTOR AÑO ---
document.getElementById('selectorAnio').addEventListener('change', (e) => {
    generarCalendario(deudaGlobal, estadoGlobal, e.target.value);
});

// --- FUNCIONES CORE ---
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
    snap.forEach((d) => {
        const u = d.data();
        lista.innerHTML += `
            <div class="miembro-card">
                <div>
                    <h6 class="mb-0 fw-bold">${u.nombre}</h6>
                    <small class="text-muted">Debe: $${u.deuda_total} | Pagado: $${u.acumulado_pagado || 0}</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="window.abrirEditorManual('${d.id}', ${u.deuda_total})">Edit</button>
            </div>`;
    });
}

window.abrirEditorManual = (uid, deuda) => {
    // Aquí podrías abrir un modal para editar la deuda manualmente
    alert("Función para editar deuda de ID: " + uid);
};

async function prepararSelectCobro() {
    const select = document.getElementById('selectCobroMiembro');
    if(!select) return;
    const snap = await getDocs(collection(db, "usuarios"));
    select.innerHTML = '<option value="">Seleccione...</option>';
    snap.forEach(d => { select.innerHTML += `<option value="${d.id}">${d.data().nombre}</option>`; });
}

// --- FORMULARIOS ---
document.getElementById('formRegistrarPago').addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('selectCobroMiembro').value;
    const monto = Number(document.getElementById('montoPago').value);
    const ref = doc(db, "usuarios", uid);
    const snap = await getDoc(ref);
    const d = snap.data();
    
    let nuevaDeuda = (d.deuda_total || 0) - monto;
    if (nuevaDeuda < 0) nuevaDeuda = 0;
    let nuevoAcumulado = (d.acumulado_pagado || 0) + monto;

    await updateDoc(ref, { 
        deuda_total: nuevaDeuda, 
        acumulado_pagado: nuevoAcumulado,
        estado_membresia: nuevaDeuda >= 20 ? "SUSPENDIDO" : "ACTIVO",
        fecha_anclaje: new Date().toISOString().split('T')[0] 
    });
    location.reload();
});

document.getElementById('formNuevoMiembro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = "Registrando..."; btn.disabled = true;
    try {
        const u = await createUserWithEmailAndPassword(authSecundaria, document.getElementById('nuevoEmail').value, document.getElementById('nuevoPass').value);
        await setDoc(doc(db, "usuarios", u.user.uid), {
            nombre: document.getElementById('nuevoNombre').value,
            cedula: document.getElementById('nuevaCedula').value,
            email: document.getElementById('nuevoEmail').value,
            telefono: document.getElementById('nuevoTel').value,
            nombre_emergencia: document.getElementById('nuevoNomEmerg').value,
            contacto_emergencia: document.getElementById('nuevoTelEmerg').value,
            tipo_sangre: document.getElementById('nuevoSangre').value,
            alergias: document.getElementById('nuevasAlergias').value,
            tratamiento: document.getElementById('nuevoTratamiento').value,
            moto: {
                modelo: document.getElementById('motoModelo').value,
                placa: document.getElementById('motoPlaca').value,
                cilindrada: document.getElementById('motoCilindrada').value
            },
            capitulo: document.getElementById('nuevoCapitulo').value,
            rango_mg: document.getElementById('nuevoRango').value,
            rol_app: document.getElementById('nuevoRol').value,
            deuda_total: 0,
            acumulado_pagado: 0,
            estado_membresia: "ACTIVO",
            fecha_anclaje: new Date().toISOString().split('T')[0]
        });
        await signOut(authSecundaria);
        location.reload();
    } catch (err) { alert(err.message); btn.innerText = "GUARDAR FICHA"; btn.disabled = false; }
});