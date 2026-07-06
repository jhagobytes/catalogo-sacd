const URL_API = "https://script.google.com/macros/s/AKfycby-ykR3U5swKoOOYOU5kB9etPkxNuVQfbxmJ5XkNLM80-NrtpYWVKNKmPzUK2uKhvKwXA/exec"; 

let catalogoCompleto = [];
const ITEMS_PER_PAGE = 500;

let claveAdministrador = ""; let paginaActual = 0; let categoriaSeleccionada = "TODO"; let busquedaActual = ""; let timerBusqueda;
let html5QrCode = null; let camaraActiva = false; let targetInputActual = "n_codigo"; 
let ultimoEscaneoTime = 0; const COOLDOWN_TIME = 1500;
let carritoCotizacion = []; 

const scanSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav');
const errorSound = new Audio('https://assets.mixkit.co/active_storage/sfx/951/951-84.wav');

// FIX: Reconstructor dinámico de Cloudinary
function reconstruirUrlCloudinary(id) {
  if (!id) return "";
  if (id.startsWith("http") || id.startsWith("data:image")) return id;
  return "https://res.cloudinary.com/dzdhsdvs9/image/upload/" + id;
}

function cambiarVista(idVista) {
  const vistas = ['vista-inicio', 'vista-catalogo', 'vista-login', 'vista-admin'];
  vistas.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === idVista) ? 'block' : 'none';
  });

  const navPublico = document.getElementById('nav-publico');
  if (idVista === 'vista-inicio' || idVista === 'vista-catalogo') {
    if (navPublico) navPublico.style.display = 'block';
    
    const tabInicio = document.getElementById('nav-tab-inicio');
    const tabCatalogo = document.getElementById('nav-tab-catalogo');
    
    if (tabInicio && tabCatalogo) {
      if (idVista === 'vista-inicio') {
        tabInicio.classList.add('active', 'text-orange');
        tabInicio.style.borderBottom = '2px solid var(--color-orange)';
        tabCatalogo.classList.remove('active', 'text-orange');
        tabCatalogo.style.borderBottom = 'none';
      } else {
        tabCatalogo.classList.add('active', 'text-orange');
        tabCatalogo.style.borderBottom = '2px solid var(--color-orange)';
        tabInicio.classList.remove('active', 'text-orange');
        tabInicio.style.borderBottom = 'none';
      }
    }
  } else {
    if (navPublico) navPublico.style.display = 'none';
  }

  if(idVista === 'vista-login') setTimeout(() => document.getElementById('clave').focus(), 100);
  window.scrollTo(0,0);
}

async function llamarServidor(operacion, datosExtra = {}) {
  try {
    const payload = { op: operacion, clave: claveAdministrador, ...datosExtra };
    const respuesta = await fetch(URL_API, { 
      method: 'POST', 
      mode: 'cors', 
      cache: 'no-store', 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }, 
      body: JSON.stringify(payload) 
    });
    if (!respuesta.ok) throw new Error("Error HTTP");
    return await respuesta.json();
  } catch (error) { console.error("Fallo de red:", error); return null; }
}

function evaluarEnter(e) { if (e.key === 'Enter') procesarLogin(); }

async function procesarLogin() {
  const claveInput = document.getElementById('clave').value;
  const btn = document.getElementById('btn-ingresar');
  const errorDiv = document.getElementById('mensaje-error');
  
  if (!claveInput) { errorDiv.textContent = "Por favor, escribe la contraseña."; errorDiv.style.display = "block"; return; }
  btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Verificando...`; errorDiv.style.display = "none";
  
  const respuesta = await llamarServidor('verificarClave', { clave: claveInput });
  if (respuesta && respuesta.exito) {
    claveAdministrador = claveInput; document.getElementById('clave').value = ""; btn.disabled = false; btn.innerHTML = "Login";
    scanSound.play().catch(()=>{});
    cambiarVista('vista-admin'); inicializarAdmin();
  } else {
    errorDiv.textContent = respuesta ? respuesta.mensaje : "Error de red."; errorDiv.style.display = "block"; btn.disabled = false; btn.innerHTML = "Login";
  }
}

const oldOnload = window.onload;
window.onload = async function() {
   cambiarVista('vista-inicio'); 
   const categories = await llamarServidor('obtenerCategoriasFiltro');
   if (categories) renderizarCategorias(categories);
   await cargarCatalogoServidor();
   if (oldOnload) await oldOnload();
   cargarEstadisticasDinamicas();
};

function mostrarCargando(estado) {
  const btnVerMas = document.getElementById('contenedor-ver-mas');
  const contenedor = document.getElementById('contenedor-productos');

  if (!btnVerMas || !contenedor) return;

  if (estado) {
    if (contenedor.innerHTML.trim() === "") {
      btnVerMas.innerHTML = `<button class="btn btn-outline-secondary rounded-pill" disabled><span class="spinner-border spinner-border-sm"></span> Cargando catálogo...</button>`;
    }
  } else {
    btnVerMas.innerHTML = "";
  }
}

function renderizarCategorias(categorias) {
  const select = document.getElementById('filtro-categoria');
  if(select) {
    select.innerHTML = '<option value="TODO">Todas las Categorías</option>';
    categorias.forEach(c => { select.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`; });
  }
}

async function cargarCatalogoServidor() {
  const contenedor = document.getElementById('contenedor-productos');
  
  const cacheData = localStorage.getItem("catalogo_sacd_local");
  const cacheTime = localStorage.getItem("catalogo_sacd_time");
  const ahora = new Date().getTime();
  const TIEMPO_EXPIRACION = 30 * 60 * 1000; 
  
  if (cacheData && cacheTime && (ahora - parseInt(cacheTime)) < TIEMPO_EXPIRACION) {
    catalogoCompleto = JSON.parse(cacheData);
    renderizarCatalogoLocal(); 
    renderizarProductosDestacados(); 
  } else {
    mostrarCargando(true); 
    if (contenedor) contenedor.style.opacity = "0.5"; 

    const resultado = await llamarServidor('obtenerTodoElCatalogo');
    
    if (resultado && Array.isArray(resultado)) {
      catalogoCompleto = resultado;
      localStorage.setItem("catalogo_sacd_local", JSON.stringify(resultado));
      localStorage.setItem("catalogo_sacd_time", ahora.toString());
      renderizarCatalogoLocal(); 
      renderizarProductosDestacados(); 
      if (contenedor) contenedor.style.opacity = "1";
      mostrarCargando(false);
    } else if (!cacheData) { 
      if (contenedor) {
        contenedor.style.opacity = "1"; 
        contenedor.innerHTML = `<div class="col-12 text-center text-danger mt-5">Error de conexión.</div>`;
      }
      mostrarCargando(false);
    } else {
       catalogoCompleto = JSON.parse(cacheData);
       renderizarCatalogoLocal(); 
       renderizarProductosDestacados(); 
       if (contenedor) contenedor.style.opacity = "1";
       mostrarCargando(false);
    }
  }
}

function renderizarCatalogoLocal() {
  const contenedor = document.getElementById('contenedor-productos');
  if (contenedor) contenedor.style.opacity = "1";
  
  let productosUnicos = [];
  const codigosVistos = new Set();
  const listaBase = Array.isArray(catalogoCompleto) ? catalogoCompleto : [];
  
  let todasSucursales = new Set();
  
  listaBase.forEach(p => {
    if (!codigosVistos.has(p.codigo)) {
      productosUnicos.push(p);
      codigosVistos.add(p.codigo);
    }
    if (p.sucursales) p.sucursales.forEach(s => todasSucursales.add(s));
  });

  const selectSucursal = document.getElementById('filtro-sucursal');
  const divSucursal = document.getElementById('div-filtro-sucursal');
  
  if (selectSucursal && divSucursal) {
    if (todasSucursales.size > 1) {
      divSucursal.style.display = "block";
      if (selectSucursal.options.length <= 1) {
        todasSucursales.forEach(s => selectSucursal.innerHTML += `<option value="${s}">${s}</option>`);
        const modalSucursal = document.getElementById('sucursal-envio');
        if (modalSucursal) modalSucursal.innerHTML = selectSucursal.innerHTML;
      }
    } else {
      divSucursal.style.display = "none";
    }
  }

  const catSeleccionada = document.getElementById('filtro-categoria') ? document.getElementById('filtro-categoria').value : "TODO";
  const sucSeleccionada = document.getElementById('filtro-sucursal') ? document.getElementById('filtro-sucursal').value : "TODAS";
  
  let productosFiltrados = productosUnicos;
  
  if (catSeleccionada !== "TODO") {
    productosFiltrados = productosFiltrados.filter(p => (p.categoria || "").toUpperCase().trim() === catSeleccionada.toUpperCase().trim());
  }
  if (sucSeleccionada !== "TODAS") {
    productosFiltrados = productosFiltrados.filter(p => p.sucursales && p.sucursales.includes(sucSeleccionada));
  }
  
  if (busquedaActual && busquedaActual.trim() !== "") {
    const query = busquedaActual.toLowerCase().trim();
    productosFiltrados = productosFiltrados.filter(p => 
      (p.nombre || "").toLowerCase().includes(query) || (p.codigo || "").toLowerCase().includes(query) || (p.marca || "").toLowerCase().includes(query)
    );
  }

  productosFiltrados.sort((a, b) => {
    const aTieneEtiqueta = (a.etiquetas && a.etiquetas.length > 0) ? 1 : 0;
    const bTieneEtiqueta = (b.etiquetas && b.etiquetas.length > 0) ? 1 : 0;
    return bTieneEtiqueta - aTieneEtiqueta;
  });
  
  const totalProductos = productosFiltrados.length;
  const fin = (paginaActual + 1) * ITEMS_PER_PAGE;
  
  dibujarTarjetas({ productos: productosFiltrados.slice(0, fin), tieneMas: fin < totalProductos });
  mostrarCargando(false);
}

function filtrarPorCategoria(categoria) {
  categoriaSeleccionada = categoria; busquedaActual = ""; 
  const buscador = document.getElementById('buscador');
  if (buscador) buscador.value = ""; 
  paginaActual = 0;
  renderizarCatalogoLocal();
}

function filtrarProductos() {
  clearTimeout(timerBusqueda);
  timerBusqueda = setTimeout(() => {
    const buscador = document.getElementById('buscador');
    busquedaActual = buscador ? buscador.value : ""; 
    paginaActual = 0; 
    renderizarCatalogoLocal(); 
  }, 300); 
}

function cargarMas() { paginaActual++; renderizarCatalogoLocal(); }

function dibujarTarjetas(resultado) {
  const contenedor = document.getElementById('contenedor-productos'); 
  const contenedorBoton = document.getElementById('contenedor-ver-mas');
  
  if (!contenedor) return; 

  if (paginaActual === 0) contenedor.innerHTML = "";
  if (resultado.productos.length === 0) { 
    contenedor.innerHTML = `<div class="col-12 text-center text-muted mt-5"><h4>No se encontraron productos 🤔</h4></div>`; 
    if (contenedorBoton) contenedorBoton.innerHTML = ""; 
    return; 
  }

  resultado.productos.forEach(p => {
    // FIX: Reconstruir imagen usando Cloudinary o link nativo
    const miniaturaRaw = (p.url || "").split(',')[0].trim();
    const miniatura = reconstruirUrlCloudinary(miniaturaRaw);
    
    let etiquetasHTML = "";
    if (p.etiquetas && p.etiquetas.length > 0) {
      const spans = p.etiquetas.map(e => `<span>${e}</span>`).join('');
      etiquetasHTML = `<div class="etiqueta-visual">${spans}</div>`;
    }

    const col = document.createElement('div'); 
    col.className = "col-sm-6 col-md-4 col-lg-3 position-relative";
    
    col.innerHTML = `
      ${etiquetasHTML}
      <div class="card h-100 shadow-sm border-0">
        <img src="${miniatura}" class="card-img-top product-img" style="cursor:pointer;" onclick="abrirDetalles('${p.codigo}')" onerror="this.src='https://placehold.co/600x400?text=Sin+Imagen'">
        <div class="card-body d-flex flex-column p-4">
          <span class="badge badge-marca mb-2 align-self-start py-1 px-3 rounded-pill">${p.marca}</span>
          <h5 class="card-title fw-bold text-dark mb-1" style="font-size:1.1rem; font-family: var(--font-heading);">${p.nombre}</h5>
          <p class="text-muted small mb-3">Cód: ${p.codigo}</p>
          
          <div class="mt-auto">
            <button class="btn btn-outline-primary fw-bold w-100 rounded-pill py-2" onclick="agregarAlCarrito('${p.codigo}', '${p.nombre}')">
              <i class="fa-solid fa-plus"></i> Añadir a cotización
            </button>
          </div>
        </div>
      </div>`;
    contenedor.appendChild(col);
  });
  if (contenedorBoton) {
    contenedorBoton.innerHTML = resultado.tieneMas ? `<button class="btn btn-brand-orange btn-lg px-5 rounded-pill" onclick="cargarMas()">Cargar más productos</button>` : "";
  }
}

function abrirDetalles(codigo) {
  const producto = catalogoCompleto.find(p => p.codigo === codigo);
  if(!producto) return;

  const cantidadStock = (producto.stock !== undefined && producto.stock !== null) ? parseInt(producto.stock) : 0;
  // FIX: Reconstruir conjunto de imágenes para carrusel
  const urls = (producto.url || "").split(',').map(u => reconstruirUrlCloudinary(u.trim())).filter(u => u !== "");
  let htmlImagen = "";

  if (urls.length > 1) {
    let indicators = "";
    let inner = "";
    urls.forEach((u, index) => {
      const active = index === 0 ? "active" : "";
      indicators += `<button type="button" data-bs-target="#carouselDetalle" data-bs-slide-to="${index}" class="${active}"></button>`;
      inner += `
        <div class="carousel-item ${active}">
          <img src="${u}" class="d-block w-100" style="object-fit: cover; height: 350px;" onerror="this.src='https://placehold.co/600x400?text=Error+de+Imagen'">
        </div>`;
    });
    htmlImagen = `
      <div id="carouselDetalle" class="carousel slide" data-bs-ride="carousel">
        <div class="carousel-indicators">${indicators}</div>
        <div class="carousel-inner">${inner}</div>
        <button class="carousel-control-prev" type="button" data-bs-target="#carouselDetalle" data-bs-slide="prev">
          <span class="carousel-control-prev-icon bg-dark rounded-circle p-2" aria-hidden="true"></span>
        </button>
        <button class="carousel-control-next" type="button" data-bs-target="#carouselDetalle" data-bs-slide="next">
          <span class="carousel-control-next-icon bg-dark rounded-circle p-2" aria-hidden="true"></span>
        </button>
      </div>`;
  } else {
    const imgUrl = urls.length === 1 ? urls[0] : "https://placehold.co/600x400?text=Sin+Imagen";
    htmlImagen = `<img src="${imgUrl}" class="img-fluid w-100" style="object-fit: contain; height: 350px;" onerror="this.src='https://placehold.co/600x400?text=Sin+Imagen'">`;
  }

  document.getElementById('contenedor-imagen-detalle').innerHTML = htmlImagen;
  document.getElementById('detalle-nombre').innerText = producto.nombre;
  document.getElementById('detalle-marca').innerText = producto.marca;
  document.getElementById('detalle-codigo').innerText = "Cód: " + producto.codigo;
  document.getElementById('detalle-caracteristicas').innerText = producto.caracteristicas || "Sin características detalladas.";
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalDetalles')).show();
}

function obtenerEtiquetaStock(stock) {
  if (stock > 5) return '<span class="badge bg-success p-2 rounded-3"><i class="fa-solid fa-check-circle"></i> Disponible</span>';
  if (stock > 0) return '<span class="badge bg-warning text-dark p-2 rounded-3 text-uppercase fw-bold" style="animation: pulse 1.5s infinite; font-size: 0.75rem;"><i class="fa-solid fa-triangle-exclamation"></i> ¡Últimas unidades!</span>';
  return '<span class="badge bg-secondary p-2 rounded-3"><i class="fa-solid fa-xmark"></i> Agotado temporalmente</span>';
}

async function iniciarContacto(codigo) {
  const respuesta = await llamarServidor('obtenerContactoVendedor', { codigo: codigo });
  if (!respuesta || respuesta.error) { 
  alert(respuesta ? respuesta.error : "Error de red."); 
  return; 
  }
  let htmlBotones = '';
  respuesta.vendedores.forEach(v => { 
    htmlBotones += `<button class="btn btn-outline-success btn-lg fw-bold w-100 mb-3 d-flex justify-content-between align-items-center rounded-4" onclick="abrirWhatsApp('${v.numero}', '${v.nombre}', '${respuesta.codigo}')"><span>💬 Hablar con ${v.nombre}</span><span class="badge bg-success text-wrap p-2 rounded-pill" style="font-size: 0.75rem;">📍 ${v.sucursal}</span></button>`; 
  });
  document.getElementById('lista-vendedores').innerHTML = htmlBotones; 
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modalVendedores')).show();
}

function abrirWhatsApp(numero, nombre, cod) { window.open(`https://wa.me/${numero}?text=${encodeURIComponent(`¡Hola, ${nombre}! Estoy interesado en el producto: ${cod}. ¿Tienen disponibilidad?`)}`, '_blank'); }

async function inicializarAdmin() {
  const listas = await llamarServidor('obtenerListasAdmin');
  if (listas) llenarSelects(listas);
  cargarTablaAdmin();
  
  document.getElementById('adminTabs').addEventListener('shown.bs.tab', async function (event) {
    await detenerCamara();
    if (event.target.id === 'nuevo-tab') {
      document.getElementById('n_metodo_codigo').value = 'manual'; cambiarMetodo('nuevo');
    } else if (event.target.id === 'actualizar-tab') {
      document.getElementById('a_metodo_codigo').value = 'manual'; cambiarMetodo('actualizar');
    }
  });
  ['a_codigo', 'n_codigo'].forEach(id => { const el = document.getElementById(id); if(el) el.addEventListener('blur', function() { this.value = this.value.trim().toUpperCase(); }); });
}

function llenarSelects(listas) {
  document.getElementById('n_categoria').innerHTML = '<option value="">Seleccione...</option>' + listas.categorias.map(c => `<option value="${c.prefijo}">${c.prefijo} - ${c.nombre}</option>`).join('');
  document.querySelectorAll('.sucursal-select').forEach(el => el.innerHTML = '<option value="">Seleccione...</option>' + listas.sucursales.map(s => `<option value="${s}">${s}</option>`).join(''));
}

async function cambiarMetodo(pestaña) {
  const metodo = document.getElementById(pestaña === 'nuevo' ? 'n_metodo_codigo' : 'a_metodo_codigo').value;
  const input = document.getElementById(pestaña === 'nuevo' ? 'n_codigo' : 'a_codigo');
  const btnRefresh = document.getElementById('btn-refresh-codigo');

  await detenerCamara();

  if (metodo === 'auto' && pestaña === 'nuevo') {
    input.readOnly = true; input.value = ""; btnRefresh.style.display = 'block';
    generarCodigoAutomatico();
  } else if (metodo === 'manual') {
    input.readOnly = false; if(btnRefresh) btnRefresh.style.display = 'none';
  } else if (metodo === 'scanner') {
    input.readOnly = false; if(btnRefresh) btnRefresh.style.display = 'none';
    targetInputActual = pestaña === 'nuevo' ? "n_codigo" : "a_codigo";
    iniciarCamara();
  }
}

function categoriaCambiada() {
  if (document.getElementById('n_metodo_codigo').value === 'auto') generarCodigoAutomatico();
}

async function generarCodigoAutomatico() {
  const prefijo = document.getElementById('n_categoria').value;
  const inputCodigo = document.getElementById('n_codigo');
  if (!prefijo) { inputCodigo.value = "⚠️ Seleccione categoría"; return; }
  
  inputCodigo.value = "⏳ Generando...";
  const res = await llamarServidor('obtenerSiguienteCodigo', { prefijo: prefijo });
  inputCodigo.value = (res && res.codigo) ? res.codigo : "❌ Error de red";
}

async function iniciarCamara() {
  if (camaraActiva) return;
  const status = document.getElementById('status');
  document.getElementById('contenedor-camara-global').style.display = 'block';
  try {
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start( { facingMode: "environment" }, { fps: 15, qrbox: function(vw, vh) { return { width: Math.floor(Math.min(vw, vh) * 0.85), height: Math.floor(Math.min(vw, vh) * 0.6) }; } },
      function(decodedText) {
        const ahora = Date.now(); if (ahora - ultimoEscaneoTime < COOLDOWN_TIME) return;
        ultimoEscaneoTime = ahora; scanSound.currentTime = 0; scanSound.play().catch(()=>{});
        document.getElementById(targetInputActual).value = decodedText;
        status.innerHTML = "✅ ¡Código capturado! (" + decodedText + ")"; status.className = "text-success small fw-bold m-0";
        setTimeout(() => { status.innerHTML = "📷 Escáner Activo"; status.className = "text-primary small fw-bold m-0"; }, COOLDOWN_TIME);
      }, function() {}
    );
    camaraActiva = true; status.innerHTML = "📷 Escáner Activo - Apunta al código";
  } catch(err) {
    errorSound.currentTime = 0; errorSound.play().catch(()=>{});
    status.innerHTML = "❌ Error de cámara. Verifica permisos."; status.className = "text-danger small fw-bold m-0"; camaraActiva = false;
  }
}

async function detenerCamara() {
  if (html5QrCode && camaraActiva) {
    try { await html5QrCode.stop(); camaraActiva = false; document.getElementById('contenedor-camara-global').style.display = 'none'; } 
    catch (err) { console.error("Error al apagar cámara", err); }
  }
}

function apagarCamaraManual() {
  detenerCamara();
  if (document.getElementById('n_metodo_codigo').value === 'scanner') { document.getElementById('n_metodo_codigo').value = 'manual'; cambiarMetodo('nuevo'); }
  if (document.getElementById('a_metodo_codigo').value === 'scanner') { document.getElementById('a_metodo_codigo').value = 'manual'; cambiarMetodo('actualizar'); }
}

async function guardarActualizacion() {
  const boton = document.getElementById('btnActualizar');
  const datos = { codigo: document.getElementById('a_codigo').value, sucursal: document.getElementById('a_sucursal').value, stock: document.getElementById('a_stock').value, pMayor: document.getElementById('a_pmayor_upd').value, pMenor: document.getElementById('a_pmenor_upd').value };
  
  if(!datos.codigo || !datos.sucursal) { alert("El código y la sucursal son obligatorios para saber qué actualizar."); return; }
  
  boton.disabled = true; boton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Actualizando...`;
  const res = await llamarServidor('actualizarInventario', { datos: datos });
  boton.disabled = false; boton.innerHTML = "ACTUALIZAR INVENTARIO";
  
  if(res) {
    alert(res.mensaje);
    if (res.mensaje.includes("Éxito")) {
      localStorage.removeItem("catalogo_sacd_local");
      localStorage.removeItem("catalogo_sacd_time");
      document.getElementById('formActualizar').reset(); 
      document.getElementById('a_metodo_codigo').value = 'manual'; 
      cambiarMetodo('actualizar'); 
      
      await cargarTablaAdmin(); 
      await cargarCatalogoServidor(); 
    }
  }
}

async function forzarLimpiarCacheUI() {
  if (!confirm("¿Seguro que deseas restablecer la memoria caché? Esto obligará al sistema a leer los datos reales en la siguiente visita.")) return;
  
  localStorage.removeItem("catalogo_sacd_local");
  localStorage.removeItem("catalogo_sacd_time");

  const status = document.getElementById('status');
  try {
    if (status) {
      document.getElementById('contenedor-camara-global').style.display = 'block'; 
      status.innerHTML = "⏳ Restableciendo caché en el servidor y local...";
      status.className = "text-warning small fw-bold m-0";
    }

    const res = await llamarServidor('forzarLimpiezaCache');
    if (!res || !res.exito) {
      throw new Error(res ? res.mensaje : "El servidor no envió una respuesta válida.");
    }

    if (status) {
      status.innerHTML = `✅ ${res.mensaje}`;
      status.className = "text-success small fw-bold m-0";
    }

    await cargarTablaAdmin();
    await cargarCatalogoServidor();

    setTimeout(() => {
      if (status && !camaraActiva) document.getElementById('contenedor-camara-global').style.display = 'none';
    }, 4000);

  } catch (error) {
    errorSound.currentTime = 0; 
    errorSound.play().catch(() => {}); 
    if (status) {
      document.getElementById('contenedor-camara-global').style.display = 'block';
      status.innerHTML = `❌ Error: ${error.message}`;
      status.className = "text-danger small fw-bold m-0";
    }
  }
}

async function cerrarSesion() { 
  await detenerCamara(); 
  claveAdministrador = ""; 
  cambiarVista('vista-inicio'); 
}

// FIX: Previsualizador con reconstructor de URL
function previsualizarImagen() {
  const url = document.getElementById('n_url').value; 
  const preview = document.getElementById('preview-container'); 
  const img = document.getElementById('img-preview');
  
  const primerUrlRaw = (url || "").split(',')[0].trim();
  const urlFinal = reconstruirUrlCloudinary(primerUrlRaw);
  
  if (urlFinal && urlFinal.startsWith('http')) { 
    img.src = urlFinal; 
    preview.style.display = 'block'; 
    img.onerror = function() { alert("⚠️ URL inválida."); preview.style.display = 'none'; }; 
  } else { 
    preview.style.display = 'none'; 
  }
}

async function cargarTablaAdmin() {
  const [productos, inventario] = await Promise.all([ llamarServidor('obtenerListaProductosAdmin'), llamarServidor('obtenerInventarioAdmin') ]);
  const tbody = document.getElementById('tabla-inventario');
  if (Array.isArray(productos) && Array.isArray(inventario) && tbody) {
    tbody.innerHTML = productos.map(p => {
       let stockSucursal = inventario.filter(inv => String(inv.codigo).trim().toUpperCase() === String(p.codigo).trim().toUpperCase());
       if(stockSucursal.length === 0) return `<tr><td>${p.codigo}</td><td>${p.nombre}</td><td><span class="badge bg-light text-dark border">${p.categoria}</span></td><td colspan="4" class="text-center text-muted text-uppercase small">Sin inventario asignado</td></tr>`;
       return stockSucursal.map(inv => `<tr><td class="fw-bold">${p.codigo}</td><td>${p.nombre}</td><td><span class="badge bg-light text-dark border">${p.categoria}</span></td><td><span class="badge bg-secondary rounded-pill px-2">${inv.sucursal}</span></td><td>Bs. ${inv.pMayor || "-"}</td><td>Bs. ${inv.pMenor || "-"}</td><td class="${inv.stock > 0 ? 'text-success fw-bold' : 'text-danger fw-bold'}">${inv.stock}</td></tr>`).join('');
    }).join('');
  }
}

document.addEventListener("DOMContentLoaded", function() {
  const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); 
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in').forEach(element => {
    observer.observe(element);
  });
});

async function cargarEstadisticasDinamicas() {
  const resultado = await llamarServidor('obtenerEstadisticas');
  
  if (resultado && resultado.exito) {
    animarContador("stat-productos", resultado.productos);
    animarContador("stat-clientes", resultado.clientes);
    animarContador("stat-garantia", resultado.garantia);
  } else {
    animarContador("stat-productos", 500);
    animarContador("stat-clientes", 50);
    animarContador("stat-garantia", 100);
  }
}

function animarContador(idElemento, valorFinal) {
  const elemento = document.getElementById(idElemento);
  if (!elemento) return;
  
  let valorActual = 0;
  const incremento = Math.ceil(valorFinal / 50); 
  const intervalo = setInterval(() => {
    valorActual += incremento;
    if (valorActual >= valorFinal) {
      elemento.innerText = valorFinal;
      clearInterval(intervalo);
    } else {
      elemento.innerText = valorActual;
    }
  }, 30);
}

async function guardarNuevo() {
  const btnGuardar = document.querySelector('[onclick="guardarNuevo()"]');
  const textoOriginal = btnGuardar ? btnGuardar.innerHTML : "Guardar";
  
  if (btnGuardar) {
    btnGuardar.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Guardando...`;
    btnGuardar.disabled = true;
  }

  try {
    const obtenerValorSeguro = (id) => {
      const elemento = document.getElementById(id);
      return elemento ? elemento.value : "";
    };

    const etiquetasSeleccionadas = Array.from(document.querySelectorAll('.etiqueta-checkbox:checked'))
                                        .map(cb => cb.value)
                                        .join(',');

    const datosNuevoProducto = {
      codigo: obtenerValorSeguro('n_codigo'), 
      nombre: obtenerValorSeguro('n_nombre'),
      prefijo: obtenerValorSeguro('n_categoria'), 
      marca: obtenerValorSeguro('n_marca'),
      caracteristicas: obtenerValorSeguro('n_caracteristicas'),
      url: obtenerValorSeguro('n_url'),
      sucursal: obtenerValorSeguro('n_sucursal'),
      stock: obtenerValorSeguro('n_stock'),
      pMayor: obtenerValorSeguro('n_pmayor'),
      pMenor: obtenerValorSeguro('n_pmenor'),
      etiquetas: etiquetasSeleccionadas 
    };

    if (!datosNuevoProducto.codigo || !datosNuevoProducto.nombre) {
      alert("Por favor, completa al menos el Código y el Nombre del producto.");
      if (btnGuardar) { btnGuardar.innerHTML = textoOriginal; btnGuardar.disabled = false; }
      return;
    }

    const respuesta = await llamarServidor('registrarNuevoProducto', { datos: datosNuevoProducto });
    alert(respuesta ? respuesta.mensaje : "Error de comunicación con el servidor.");

    if (respuesta && respuesta.mensaje && respuesta.mensaje.includes("Éxito")) {
      const formulario = document.getElementById('formNuevo');
      if (formulario) formulario.reset();
      
      const imgPreview = document.getElementById('preview-container');
      if (imgPreview) imgPreview.style.display = 'none';

      await cargarTablaAdmin();
      await cargarCatalogoServidor();
    }

  } catch (error) {
    console.error("Error crítico al guardar:", error);
    alert("Hubo un error de conexión al intentar guardar. Revisa la consola.");
  } finally {
    if (btnGuardar) {
      btnGuardar.innerHTML = textoOriginal;
      btnGuardar.disabled = false;
    }
  }
}

function agregarAlCarrito(codigo, nombre) {
  const item = carritoCotizacion.find(i => i.codigo === codigo);
  if (item) item.cantidad++; else carritoCotizacion.push({codigo, nombre, cantidad: 1});
  
  const widget = document.getElementById('widget-carrito');
  if (widget) widget.style.display = "block";
  document.getElementById('widget-items').innerText = carritoCotizacion.length + (carritoCotizacion.length === 1 ? " ítem" : " ítems");
}

function abrirModalCarrito() {
  const lista = document.getElementById('lista-carrito');
  if(!lista) return;

  lista.innerHTML = "";
  const flujoContenedor = document.getElementById('contenedor-flujo-carrito');
  const listaVendedores = document.getElementById('lista-vendedores-carrito');
  
  if (listaVendedores) listaVendedores.innerHTML = "";

  if (carritoCotizacion.length === 0) {
    lista.innerHTML = `<li class="list-group-item text-center text-muted border-0 py-4"><i class="fa-solid fa-cart-arrow-down fs-1 mb-3 opacity-50"></i><br>No has añadido productos aún.</li>`;
    if (flujoContenedor) flujoContenedor.style.display = "none";
  } else {
    carritoCotizacion.forEach((item, index) => {
      lista.innerHTML += `
        <li class="list-group-item d-flex justify-content-between align-items-center border-0 px-0">
          <div>
            <h6 class="mb-0 fw-bold text-dark">${item.nombre}</h6>
            <small class="text-muted">Cód: ${item.codigo}</small>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-primary rounded-pill text-white px-3">x${item.cantidad}</span>
            <button class="btn btn-sm btn-outline-danger border-0 rounded-circle" onclick="quitarDelCarrito(${index})"><i class="fa-solid fa-trash"></i></button>
          </div>
        </li>`;
    });
    
    if (flujoContenedor) flujoContenedor.style.display = "block";
    const selectSucursal = document.getElementById('sucursal-envio');
    const filtroGlobal = document.getElementById('filtro-sucursal');
    
    if (selectSucursal && filtroGlobal) {
      let optionsHTML = '<option value="">Selecciona una sucursal...</option>';
      Array.from(filtroGlobal.options).forEach(opt => {
        if (opt.value !== "TODAS") {
          optionsHTML += `<option value="${opt.value}">${opt.text}</option>`;
        }
      });
      selectSucursal.innerHTML = optionsHTML;
      
      if (filtroGlobal.options.length === 2) {
        const unicaSucursal = filtroGlobal.options[1].value;
        selectSucursal.value = unicaSucursal;
        cargarVendedores(unicaSucursal); 
      } else {
        selectSucursal.value = ""; 
      }
    }
  }
  
  const modalObj = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCarrito'));
  modalObj.show();
}

function quitarDelCarrito(index) {
  carritoCotizacion.splice(index, 1);
  const widget = document.getElementById('widget-carrito');
  const items = document.getElementById('widget-items');
  if(carritoCotizacion.length === 0) {
    if(widget) widget.style.display = "none";
  } else {
    if(items) items.innerText = carritoCotizacion.length + " ítems";
  }
  abrirModalCarrito();
}

function vaciarCarrito() {
  carritoCotizacion = [];
  const widget = document.getElementById('widget-carrito');
  if(widget) widget.style.display = "none";
  const modal = bootstrap.Modal.getInstance(document.getElementById('modalCarrito'));
  if(modal) modal.hide();
}

async function cargarVendedores(sucursalForzada = null) {
  const select = document.getElementById('sucursal-envio');
  const sucursal = sucursalForzada || (select ? select.value : "");
  const listaContainer = document.getElementById('lista-vendedores-carrito');
  
  if (!listaContainer) return;

  if (!sucursal || sucursal === "TODAS") {
    listaContainer.innerHTML = "";
    return;
  }
  
  listaContainer.innerHTML = `<div class="text-center p-3"><div class="spinner-border text-orange spinner-border-sm mb-2"></div><br><small class="fw-bold text-muted">Buscando asesores en ${sucursal}...</small></div>`;
  
  const respuesta = await llamarServidor('obtenerVendedoresPorSucursal', { sucursal: sucursal });
  
  if (respuesta && respuesta.exito && respuesta.vendedores.length > 0) {
    let html = `<label class="form-label fw-bold text-secondary small mb-3">2️⃣ Haz clic en un asesor para enviar el pedido:</label><div class="d-flex flex-column gap-2">`;
    
    respuesta.vendedores.forEach(v => {
      html += `
        <button type="button" class="btn btn-outline-success w-100 rounded-pill d-flex align-items-center justify-content-between px-4 py-2" 
                onclick="enviarWhatsAppAAsesor('${v.numero}', '${v.nombre}')">
          <span class="fw-bold text-start">👋 ${v.nombre}</span>
          <i class="fa-brands fa-whatsapp fs-4"></i>
        </button>`;
    });
    
    html += `</div>`;
    listaContainer.innerHTML = html;
  } else {
    listaContainer.innerHTML = `<div class="alert alert-warning small border-0"><i class="fa-solid fa-triangle-exclamation"></i> No hay asesores activos en ${sucursal} en este momento.</div>`;
  }
}

function enviarWhatsAppAAsesor(numero, nombreAsesor) {
  if (carritoCotizacion.length === 0) return;
  
  let mensaje = `*¡Hola ${nombreAsesor}!* 👋%0A%0ASoy un cliente interesado en enviar este carrito para cotización/pedido:%0A%0A`;
  
  carritoCotizacion.forEach(item => {
    mensaje += `▪️ *${item.cantidad}x* ${item.nombre} (_Cód: ${item.codigo}_)%0A`;
  });
  
  mensaje += `%0A¿Me confirmas disponibilidad y los pasos a seguir? Quedo atento.`;
  
  window.open(`https://wa.me/${numero}?text=${mensaje}`, '_blank');
}

function renderizarProductosDestacados() {
  const contenedor = document.getElementById('productos-destacados-preview');
  if (!contenedor) return;

  contenedor.innerHTML = ""; 

  const productosDestacados = catalogoCompleto.filter(p => p.etiquetas && p.etiquetas.length > 0);

  if (productosDestacados.length === 0) {
    contenedor.innerHTML = `<div class="col-12 text-center text-muted">No hay productos destacados en este momento.</div>`;
    return;
  }

  const productosMostrar = productosDestacados.slice(0, 3); 

  productosMostrar.forEach(p => {
    // FIX: Aplicar reconstructor también a destacados
    const miniaturaRaw = (p.url || "").split(',')[0].trim();
    const miniatura = reconstruirUrlCloudinary(miniaturaRaw);
    
    const etiquetaPrincipal = p.etiquetas[0]; 

    const htmlCard = `
      <div class="col-md-4">
        <div class="card h-100 shadow-sm border-0 position-relative">
          <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style="z-index: 10;">
            ${etiquetaPrincipal}
          </span>
          <img src="${miniatura}" class="card-img-top product-img" style="cursor:pointer;" onclick="abrirDetalles('${p.codigo}')" onerror="this.src='https://placehold.co/600x400?text=Sin+Imagen'">
          <div class="card-body text-center d-flex flex-column">
             <span class="text-muted small mb-1">${p.marca}</span>
             <h5 class="fw-bold mb-3">${p.nombre}</h5>
             <div class="mt-auto">
               <button class="btn btn-outline-primary btn-sm rounded-pill px-4" onclick="cambiarVista('vista-catalogo')">Ver en catálogo</button>
             </div>
          </div>
        </div>
      </div>
    `;
    contenedor.innerHTML += htmlCard;
  });
}

setInterval(() => { llamarServidor('keepAlive'); }, 300000);
