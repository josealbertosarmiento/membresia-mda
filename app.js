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

        onAuthStateChanged(auth, async (user) => {
            if (!user) { window.location.href = "index.html"; return; } 
            
            try {
                const userRef = doc(db, "usuarios", user.uid);
                const userDoc = await getDoc(userRef);

                if (userDoc.exists()) {
                    const d = userDoc.data();
                    let deudaBase = Number(d.deuda_total) || 0;
                    const hoy = new Date();
                    const fechaAnclaje = d.fecha_anclaje ? new Date(d.fecha_anclaje + "T00:00:00") : new Date(2026, 2, 1);

                    // 1. CALCULAR MESES NUEVOS (Solo si no está suspendido)
                    let mesesNuevos = ((hoy.getFullYear() - fechaAnclaje.getFullYear()) * 12) + (hoy.getMonth() - fechaAnclaje.getMonth());
                    if (hoy.getDate() <= 5 && mesesNuevos > 0) mesesNuevos--; 
                    if (mesesNuevos < 0) mesesNuevos = 0;

                    let deudaCalculada = deudaBase + (mesesNuevos * (d.estado_membresia === "SUSPENDIDO" ? 0 : 5));
                    
                    // 2. LÓGICA DE SUSPENSIÓN AUTOMÁTICA
                    let nuevoEstado = d.estado_membresia || "ACTIVO";
                    if (deudaCalculada >= 20) {
                        nuevoEstado = "SUSPENDIDO";
                    } else if (deudaCalculada < 20 && d.estado_membresia === "SUSPENDIDO") {
                        nuevoEstado = "ACTIVO";
                    }

                    // 3. ACTUALIZAR FIREBASE SI PASÓ TIEMPO
                    if (mesesNuevos > 0 || nuevoEstado !== d.estado_membresia) {
                        await updateDoc(userRef, { 
                            deuda_total: deudaCalculada, 
                            estado_membresia: nuevoEstado, 
                            fecha_anclaje: hoy.toISOString().split('T')[0] 
                        });
                    }

                    deudaGlobal = deudaCalculada;
                    estadoGlobal = nuevoEstado;

                    // INTERFAZ
                    document.getElementById('txtNombreUsuario').innerText = "Hola, " + (d.nombre || "Usuario");
                    document.getElementById('miDeudaTotal').innerText = "$" + deudaGlobal;
                    document.getElementById('txtRolMenu').innerText = d.rol_app || "MIEMBRO";

                    const ind = document.getElementById('indicadorSuspension');
                    if(estadoGlobal === "SUSPENDIDO") {
                        ind.innerText = "⚠️ SUSPENSIÓN: Debe regularizar para usar sus colores.";
                        ind.classList.remove('d-none');
                    } else { ind.classList.add('d-none'); }

                    generarCalendario(deudaGlobal, estadoGlobal, "2026");

                    if (d.rol_app === "ADMIN") {
                        document.getElementById('seccionDirectorio').classList.remove('d-none');
                        document.getElementById('btnNuevoRegistro').classList.remove('d-none');
                        cargarUsuarios();
                        prepararSelectCobro();
                    }
                }
            } catch (e) { console.error(e); }
            finally {
                document.getElementById('pantallaCarga').classList.add('d-none');
                document.getElementById('appContent').classList.remove('d-none');
            }
        });

        // 4. CALENDARIO RETROACTIVO INTELIGENTE
        function generarCalendario(deuda, estado, anioVer) {
            const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
            const cont = document.getElementById('calendarioPagos');
            const hoy = new Date();
            const anioActual = hoy.getFullYear();
            const mesActual = hoy.getMonth();
            const diaActual = hoy.getDate();

            let mesesDeudaTotal = Math.floor(deuda / 5);
            cont.innerHTML = "";

            meses.forEach((nombre, i) => {
                let color = "bg-secondary text-muted"; // Futuro
                let estilo = "";
                let texto = nombre;

                const esteAnio = parseInt(anioVer);

                if (esteAnio < anioActual || (esteAnio === anioActual && i <= mesActual)) {
                    // Diferencia de meses desde HOY hacia atrás para este cuadrito
                    let diff = ((anioActual - esteAnio) * 12) + (mesActual - i);

                    if (esteAnio === anioActual && i === mesActual && diaActual <= 5) {
                        color = "bg-secondary text-muted"; // Gracia
                    } else if (diff < mesesDeudaTotal) {
                        if (estado === "SUSPENDIDO") {
                            color = "bg-dark text-white"; // Negro suspendido
                            estilo = "border: 1px solid red; text-decoration: line-through;";
                        } else {
                            color = "bg-danger text-white"; // Rojo deuda
                        }
                    } else if (estado === "SUSPENDIDO" && diff >= mesesDeudaTotal && diff < 12) {
                        color = "bg-dark text-muted"; // Meses nulos (amnistía)
                        estilo = "opacity: 0.5;";
                        texto += " (X)";
                    } else {
                        color = "bg-success text-white"; // Verde pagado
                    }
                }
                cont.innerHTML += `<div class="col-3"><div class="p-2 rounded small fw-bold ${color}" style="${estilo}">${texto}</div></div>`;
            });
        }

        // LÓGICA ADMINISTRATIVA
        async function cargarUsuarios() {
            const lista = document.getElementById('listaUsuarios');
            const snap = await getDocs(collection(db, "usuarios"));
            lista.innerHTML = "";
            snap.forEach((d) => {
                const u = d.data();
                lista.innerHTML += `
                    <div class="miembro-card">
                        <div class="d-flex align-items-center">
                            <div class="avatar">${(u.nombre || "M").charAt(0).toUpperCase()}</div>
                            <div><h6 class="mb-0 fw-bold">${u.nombre}</h6><small class="text-muted">$${u.deuda_total || 0} - ${u.estado_membresia}</small></div>
                        </div>
                        <button class="btn btn-sm btn-outline-light" onclick="window.abrirEditor('${d.id}', ${u.deuda_total})">Editar</button>
                    </div>`;
            });
        }

        window.abrirEditor = (uid, deuda) => {
            document.getElementById('editUid').value = uid;
            document.getElementById('editDeuda').value = deuda;
            new bootstrap.Modal(document.getElementById('modalEditarMiembro')).show();
        };

        document.getElementById('formEditarMiembro').addEventListener('submit', async (e) => {
            e.preventDefault();
            const uid = document.getElementById('editUid').value;
            const nuevaDeuda = Number(document.getElementById('editDeuda').value);
            await updateDoc(doc(db, "usuarios", uid), {
                deuda_total: nuevaDeuda,
                estado_membresia: nuevaDeuda >= 20 ? "SUSPENDIDO" : "ACTIVO",
                fecha_anclaje: new Date().toISOString().split('T')[0]
            });
            location.reload();
        });

        async function prepararSelectCobro() {
            const select = document.getElementById('selectCobroMiembro');
            const snap = await getDocs(collection(db, "usuarios"));
            select.innerHTML = '<option value="">Seleccione Miembro...</option>';
            snap.forEach(d => { select.innerHTML += `<option value="${d.id}">${d.data().nombre}</option>`; });
        }

        document.getElementById('formRegistrarPago').addEventListener('submit', async (e) => {
            e.preventDefault();
            const uid = document.getElementById('selectCobroMiembro').value;
            const monto = Number(document.getElementById('montoPago').value);
            const ref = doc(db, "usuarios", uid);
            const d = (await getDoc(ref)).data();
            let nueva = (d.deuda_total || 0) - monto;
            if (nueva < 0) nueva = 0;
            await updateDoc(ref, { 
                deuda_total: nueva, 
                estado_membresia: nueva >= 20 ? "SUSPENDIDO" : "ACTIVO", 
                fecha_anclaje: new Date().toISOString().split('T')[0] 
            });
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
                deuda_total: 0,
                estado_membresia: "ACTIVO",
                fecha_anclaje: new Date().toISOString().split('T')[0]
            });
            await signOut(authSecundaria);
            location.reload();
        });

        document.getElementById('btnCerrarSesion').onclick = () => signOut(auth).then(() => location.href = "index.html");
        document.getElementById('selectorAnio').onchange = (e) => generarCalendario(deudaGlobal, estadoGlobal, e.target.value);