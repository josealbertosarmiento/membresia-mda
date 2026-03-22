// [TUS IMPORTS Y CONFIGURACIÓN AQUÍ]

let deudaGlobal = 0;
let estadoGlobal = "ACTIVO";
let rolUsuarioActual = "ESTANDAR";

// --- SESION ---
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
            
            // COBRO AUTOMÁTICO MENSUAL
            let dCalc = deuda;
            if (meses > 0 && d.estado_membresia === "ACTIVO") {
                dCalc += (meses * 5);
            }
            
            // SUSPENSIÓN AUTOMÁTICA (Pero respetando montos mayores manuales)
            let est = d.estado_membresia || "ACTIVO";
            if (dCalc >= 20) est = "SUSPENDIDO";
            else est = "ACTIVO";

            if (meses > 0 || est !== d.estado_membresia) {
                await updateDoc(doc(db, "usuarios", user.uid), { deuda_total: dCalc, estado_membresia: est, fecha_anclaje: hoy.toISOString().split('T')[0] });
            }

            deudaGlobal = dCalc; estadoGlobal = est;
            document.getElementById('txtNombreUsuario').innerText = "Hola, " + d.nombre;
            document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
            generarCalendario(deudaGlobal, estadoGlobal, "2026");

            // PERMISOS DE VISTA
            if (["ADMIN", "TESORERO", "SECRETARIO", "DIRECTIVO"].includes(rolUsuarioActual)) {
                document.getElementById('navAdmin').classList.remove('d-none');
                cargarBalanceGlobal(); // Todos los directivos ven los totales
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

// --- BALANCES GRUPALES ---
async function cargarBalanceGlobal() {
    try {
        const snap = await getDocs(collection(db, "usuarios"));
        let porCobrar = 0;
        let recaudado = 0;
        
        snap.forEach(d => {
            porCobrar += (d.data().deuda_total || 0);
            recaudado += (d.data().acumulado_pagado || 0);
        });

        // Obtener Saldo Inicial
        const docFinanzas = await getDoc(doc(db, "config", "finanzas"));
        let saldoInicial = docFinanzas.exists() ? docFinanzas.data().caja_inicial : 0;

        document.getElementById('totalEnCaja').innerText = "$" + (saldoInicial + recaudado);
        document.getElementById('totalPorCobrar').innerText = "$" + porCobrar;
    } catch (e) { console.log(e); }
}

// --- GUARDAR CAJA INICIAL ---
document.getElementById('formCajaInicial').addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = Number(document.getElementById('montoCajaInicial').value);
    await setDoc(doc(db, "config", "finanzas"), { caja_inicial: monto }, { merge: true });
    alert("Saldo inicial del MG actualizado.");
    location.reload();
});

// --- EDITAR SALDO MANUAL (CORREGIDO PARA ADMITIR > 20) ---
document.getElementById('formEditarSaldo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('editUid').value;
    const monto = Number(document.getElementById('nuevoMontoManual').value);
    const ref = doc(db, "usuarios", uid);
    
    // Si pones 55, el sistema pone SUSPENDIDO, pero deja los 55.
    // Si pones 0, el sistema pone ACTIVO.
    let nuevoEst = (monto >= 20) ? "SUSPENDIDO" : "ACTIVO";
    
    await updateDoc(ref, { 
        deuda_total: monto, 
        estado_membresia: nuevoEst,
        fecha_anclaje: new Date().toISOString().split('T')[0] 
    });
    location.reload();
});

// [RESTO DE TUS FUNCIONES: generarCalendario, cargarUsuarios, etc.]