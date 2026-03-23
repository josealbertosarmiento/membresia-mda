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
// --- DENTRO DE onAuthStateChanged ---
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (snap.exists()) {
            const d = snap.data();
            rolUsuarioActual = d.rol_app;

            let deudaActual = Number(d.deuda_total) || 0;
            let estado = d.estado_membresia || "ACTIVO";
            const hoy = new Date();
            
            // 1. Verificar si hoy es día de cobro (Día 6 de cada mes)
            // Solo sumamos deuda si el miembro está ACTIVO.
            // Si ya está SUSPENDIDO, la deuda se queda trabada en lo que esté (ej. $20 o $55)
            const anclaje = d.fecha_anclaje ? new Date(d.fecha_anclaje + "T00:00:00") : new Date(2026, 2, 1);
            let mesesTranscurridos = ((hoy.getFullYear() - anclaje.getFullYear()) * 12) + (hoy.getMonth() - anclaje.getMonth());
            
            // Si estamos después del día 5 y ha pasado un mes desde el último anclaje...
            if (hoy.getDate() > 5 && mesesTranscurridos > 0) {
                if (estado === "ACTIVO") {
                    deudaActual += 5; // Solo sumamos si no estaba suspendido
                    // Si con este nuevo mes llega a $20, se suspende
                    if (deudaActual >= 20) estado = "SUSPENDIDO";
                }
                // Actualizamos la fecha de anclaje para no volver a sumar este mes
                await updateDoc(doc(db, "usuarios", user.uid), { 
                    deuda_total: deudaActual, 
                    estado_membresia: estado, 
                    fecha_anclaje: hoy.toISOString().split('T')[0] 
                });
            }

            deudaGlobal = deudaActual;
            estadoGlobal = estado;

            document.getElementById('txtNombreUsuario').innerText = "Hola, " + d.nombre;
            document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
            
            configurarSelectorAnios();
            generarCalendario(deudaGlobal, estadoGlobal, document.getElementById('selectorAnio').value);
            
            // ... resto de los permisos (Caja, Fichas, etc) ...
        }
    } catch (e) { console.error(e); }
});

// --- FUNCIÓN DEL CALENDARIO (BASADO EN CUOTAS) ---
function generarCalendario(deuda, estado, anioSel) {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const cont = document.getElementById('calendarioPagos');
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();

    let mesesQueDebe = Math.floor(deuda / 5);
    cont.innerHTML = "";
    cont.className = "calendar-grid";

    meses.forEach((n, i) => {
        let clase = "month-future"; 
        let sub = "Próximo";
        const anioInt = parseInt(anioSel);

        // Si el mes es pasado o es el presente
        if (anioInt < anioActual || (anioInt === anioActual && i <= mesActual)) {
            // Calculamos la distancia desde el mes actual hacia atrás
            let distancia = ((anioActual - anioInt) * 12) + (mesActual - i);

            if (distancia < mesesQueDebe) {
                // Está dentro del rango de deuda
                if (estado === "SUSPENDIDO") {
                    clase = "month-null";
                    sub = "Congelado";
                    n += " (X)";
                } else {
                    clase = "month-debt";
                    sub = "Pendiente";
                }
            } else {
                // Si está más atrás de los meses que debe, ya está pagado
                clase = "month-paid";
                sub = "Al día";
            }
        }

        cont.innerHTML += `<div class="month-card ${clase}"><div>${n}</div><div style="font-size:8px; opacity:0.7">${sub}</div></div>`;
    });
}

// --- REGISTRO DE PAGO (MANEJO DE $8, $10, etc.) ---
document.getElementById('formRegistrarPago').addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('selectCobroMiembro').value;
    const monto = Number(document.getElementById('montoPago').value);
    
    try {
        const refUser = doc(db, "usuarios", uid);
        const snap = await getDoc(refUser);
        const d = snap.data();
        
        // Restamos el monto tal cual. 
        // Si debe $55 y paga $8, su nueva deuda es $47.
        // El calendario calculará: 47 / 5 = 9.4 -> O sea, debe 9 meses y le sobran $2 para el 10mo.
        let nD = Math.max(0, (d.deuda_total || 0) - monto);
        let nA = (d.acumulado_pagado || 0) + monto;

        await updateDoc(refUser, { 
            deuda_total: nD, 
            acumulado_pagado: nA, 
            // Si la deuda baja de $20, se activa automáticamente
            estado_membresia: nD >= 20 ? "SUSPENDIDO" : "ACTIVO", 
            fecha_anclaje: new Date().toISOString().split('T')[0] 
        });

        await addDoc(collection(db, "finanzas"), {
            fecha: new Date().toISOString(),
            nombre_miembro: d.nombre,
            monto: monto,
            tipo: "INGRESO_CUOTA"
        });

        location.reload();
    } catch (e) { console.error(e); }
});
// AÑOS DINÁMICOS (Blques de 3 años)
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

// [MANTENER AQUÍ EL RESTO DE TUS FUNCIONES: cargarBalanceGlobal, cargarUsuarios, registrarPago, etc.]

document.getElementById('selectorAnio').addEventListener('change', (e) => generarCalendario(deudaGlobal, estadoGlobal, e.target.value));
document.getElementById('btnCerrarSesion').addEventListener('click', () => signOut(auth).then(() => window.location.href = "index.html"));