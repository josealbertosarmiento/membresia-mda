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

// App secundaria para crear usuarios sin cerrar la sesión del admin
const appSecundaria = initializeApp(firebaseConfig, "Secondary");
const authSecundaria = getAuth(appSecundaria);

let deudaGlobal = 0;
let estadoGlobal = "ACTIVO";
let rolUsuarioActual = "ESTANDAR";

// --- 1. NAVEGACIÓN (BOTONES QUE NO HACÍAN CLIC) ---
const cambiarVista = (vista) => {
    const vPers = document.getElementById('vistaPersonal');
    const vGest = document.getElementById('vistaGestion');
    const vSecre = document.getElementById('vistaSecretario');
    
    if(vPers) vPers.classList.add('d-none');
    if(vGest) vGest.classList.add('d-none');
    if(vSecre) vSecre.classList.add('d-none');

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    if (vista === 'personal') {
        vPers.classList.remove('d-none');
        document.getElementById('btnNavPers').classList.add('active');
    } else if (vista === 'gestion') {
        vGest.classList.remove('d-none');
        document.getElementById('btnNavGest').classList.add('active');
    } else if (vista === 'secretario') {
        vSecre.classList.remove('d-none');
        document.getElementById('btnNavSecre').classList.add('active');
    }
};

document.getElementById('btnNavPers').onclick = () => cambiarVista('personal');
document.getElementById('btnNavGest').onclick = () => cambiarVista('gestion');
if(document.getElementById('btnNavSecre')) {
    document.getElementById('btnNavSecre').onclick = () => cambiarVista('secretario');
}

// --- 2. CONTROL DE SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    
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

        // Mostrar funciones según ROL
        if (["ADMIN", "TESORERO", "SECRETARIO"].includes(rolUsuarioActual)) {
            document.getElementById('navAdmin').classList.remove('d-none');
            cargarUsuarios();
            cargarBalanceGlobal();
            if(rolUsuarioActual === "ADMIN" || rolUsuarioActual === "TESORERO") {
                document.getElementById('btnsTesorero').classList.remove('d-none');
                prepararSelectCobro();
            }
        }
    }
    document.getElementById('pantallaCarga').classList.add('d-none');
    document.getElementById('appContent').classList.remove('d-none');
});

// --- 3. FUNCIONES DE CARGA (CAJA Y MIEMBROS) ---
async function cargarBalanceGlobal() {
    const snap = await getDocs(collection(db, "usuarios"));
    let porCobrar = 0;
    let recaudado = 0;
    snap.forEach(doc => {
        porCobrar += (doc.data().deuda_total || 0);
        re recaudado += (doc.data().acumulado_pagado || 0);
    });
    
    // Sumar Fondo Inicial
    const conf = await getDoc(doc(db, "config", "finanzas"));
    let inicial = conf.exists() ? conf.data().caja_inicial : 0;

    document.getElementById('totalEnCaja').innerText = "$" + (recaudado + inicial);
    document.getElementById('totalPorCobrar').innerText = "$" + porCobrar;
}

async function cargarUsuarios() {
    const lista = document.getElementById('listaUsuarios');
    const snap = await getDocs(collection(db, "usuarios"));
    lista.innerHTML = "";
    snap.forEach(d => {
        const u = d.data();
        lista.innerHTML += `
            <div class="miembro-card">
                <div><b>${u.nombre}</b><br><small>$${u.deuda_total} - ${u.estado_membresia}</small></div>
                <button class="btn btn-sm btn-outline-danger" onclick="window.abrirEditor('${d.id}', '${u.nombre}', ${u.deuda_total})">Editar</button>
            </div>`;
    });
}

// --- 4. ACCIONES (CLICS DE BOTONES) ---

// Cobrar Cuota
document.getElementById('formRegistrarPago').onsubmit = async (e) => {
    e.preventDefault();
    const uid = document.getElementById('selectCobroMiembro').value;
    const monto = Number(document.getElementById('montoPago').value);
    
    const ref = doc(db, "usuarios", uid);
    const userDoc = await getDoc(ref);
    const actual = userDoc.data();

    let nuevaDeuda = Math.max(0, (actual.deuda_total || 0) - monto);
    let nuevoAcumulado = (actual.acumulado_pagado || 0) + monto;

    await updateDoc(ref, {
        deuda_total: nuevaDeuda,
        acumulado_pagado: nuevoAcumulado,
        estado_membresia: nuevaDeuda >= 20 ? "SUSPENDIDO" : "ACTIVO"
    });

    await addDoc(collection(db, "finanzas"), {
        fecha: new Date().toISOString(),
        nombre: actual.nombre,
        monto: monto,
        tipo: "INGRESO"
    });

    location.reload();
};

// Crear Usuario Nuevo
document.getElementById('formNuevoMiembro').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitRegistro');
    btn.innerText = "Guardando..."; btn.disabled = true;

    try {
        const email = document.getElementById('nuevoEmail').value;
        const pass = document.getElementById('nuevoPass').value;
        
        const res = await createUserWithEmailAndPassword(authSecundaria, email, pass);
        await setDoc(doc(db, "usuarios", res.user.uid), {
            nombre: document.getElementById('nuevoNombre').value,
            email: email,
            rol_app: document.getElementById('nuevoRol').value,
            deuda_total: 0,
            acumulado_pagado: 0,
            estado_membresia: "ACTIVO"
        });
        
        await signOut(authSecundaria);
        location.reload();
    } catch (err) {
        alert("Error: " + err.message);
        btn.innerText = "GUARDAR"; btn.disabled = false;
    }
};

// Fondo Inicial
window.aplicarFondoInicial = async () => {
    const monto = prompt("Ingresa el monto del fondo inicial $:");
    if(monto) {
        await setDoc(doc(db, "config", "finanzas"), { caja_inicial: Number(monto) });
        alert("Fondo inicial actualizado");
        location.reload();
    }
};

// --- CALENDARIO ---
function generarCalendario(deuda, estado, anio) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cont = document.getElementById('calendarioPagos');
    const hoy = new Date();
    const mesAct = hoy.getMonth();
    const anioAct = hoy.getFullYear();
    const cuotas = Math.floor(deuda / 5);

    cont.innerHTML = "";
    meses.forEach((n, i) => {
        let clase = "month-future", sub = "Próximo";
        const esPasado = (parseInt(anio) < anioAct) || (parseInt(anio) === anioAct && i <= mesAct);

        if (esPasado) {
            let dist = ((anioAct - parseInt(anio)) * 12) + (mesAct - i);
            if (dist < cuotas) {
                clase = estado === "SUSPENDIDO" ? "month-null" : "month-debt";
                sub = estado === "SUSPENDIDO" ? "Nulo" : "Deuda";
            } else {
                clase = "month-paid"; sub = "Al día";
            }
        }
        cont.innerHTML += `<div class="month-card ${clase}"><div>${n}</div><div style="font-size:8px">${sub}</div></div>`;
    });
}

// Helpers
async function prepararSelectCobro() {
    const select = document.getElementById('selectCobroMiembro');
    const snap = await getDocs(collection(db, "usuarios"));
    select.innerHTML = '<option value="">Seleccionar Miembro...</option>';
    snap.forEach(d => { select.innerHTML += `<option value="${d.id}">${d.data().nombre}</option>`; });
}

function configurarSelectorAnios() {
    const s = document.getElementById('selectorAnio');
    const actual = new Date().getFullYear();
    s.innerHTML = `<option value="${actual-1}">${actual-1}</option><option value="${actual}" selected>${actual}</option><option value="${actual+1}">${actual+1}</option>`;
}

document.getElementById('btnCerrarSesion').onclick = () => signOut(auth);
document.getElementById('selectorAnio').onchange = (e) => generarCalendario(deudaGlobal, estadoGlobal, e.target.value);