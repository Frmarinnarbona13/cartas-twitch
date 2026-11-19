// =====================================================================
// Vista del espectador: energía, packs, reserva, álbum, top y perfil.
// =====================================================================
const $ = (id) => document.getElementById(id);

const estado = {
  datos: null,          // respuesta de /api/yo
  seccion: 'coleccion', // coleccion | top | perfil
  vista: 'packs',       // packs | reserva | album
  orden: 'rareza',
  filtro: 'mias',
  pagina: 1,
  abriendo: false,
  desfase: 0,           // diferencia entre el reloj del servidor y el nuestro
  ranking: null,
};

// ------------------------------------------------------------------
// Arranque
// ------------------------------------------------------------------
let arrancado = false;
Twitch.ext.onAuthorized((auth) => {
  tokenTwitch = auth.token;
  cargar();
  if (!arrancado) {
    arrancado = true;
    setInterval(ping, 2 * 60 * 1000);
    setInterval(() => {
      if (!estado.datos?.identidad) return;
      pintarEnergia();
      if (estado.seccion === 'coleccion' && estado.vista === 'packs' && !estado.abriendo) pintarPacks();
    }, 20 * 1000);
  }
});

// Iconos de la interfaz
document.querySelectorAll('.ico-nav').forEach((el) => el.replaceWith(icono(el.dataset.ico)));
document.querySelector('.ico-ayuda').replaceWith(icono('ayuda'));
$('pag-ant').appendChild(icono('izq'));
$('pag-sig').appendChild(icono('der'));

$('btn-compartir').addEventListener('click', () => Twitch.ext.actions.requestIdShare());
function pintarBotonSonido() {
  $('btn-sonido').innerHTML = '';
  $('btn-sonido').appendChild(icono(Sonido.silencio ? 'silencio' : 'sonido'));
  $('btn-sonido').title = Sonido.silencio ? 'Activar sonido' : 'Silenciar';
}
pintarBotonSonido();
$('btn-sonido').addEventListener('click', () => {
  Sonido.alternar();
  pintarBotonSonido();
  Sonido.play('click');
});
$('chip-polvo').addEventListener('click', () => irA('tienda'));
$('btn-desmontar').addEventListener('click', () => asistenteDesmontar());
$('btn-reintentar').addEventListener('click', cargar);
$('btn-energia').addEventListener('click', explicarEnergia);

$('nav-inferior').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) irA(b.dataset.seccion, estado.vista);
});
$('sub-nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) irA('coleccion', b.dataset.vista);
});
$('orden').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  estado.orden = b.dataset.orden;
  estado.pagina = 1;
  pintarAlbum();
});
$('filtro').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  estado.filtro = b.dataset.filtro;
  estado.pagina = 1;
  pintarAlbum();
});
$('pag-ant').addEventListener('click', () => { estado.pagina--; pintarAlbum(); });
$('pag-sig').addEventListener('click', () => { estado.pagina++; pintarAlbum(); });
window.addEventListener('resize', () => estado.vista === 'album' && pintarAlbum());

function mostrarVista(id) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'v-' + id));
  $('contenido').scrollTop = 0;
}

function irA(seccion, vista) {
  estado.seccion = seccion;
  estado.vista = vista || estado.vista;
  document.querySelectorAll('#nav-inferior button').forEach((b) => b.classList.toggle('activo', b.dataset.seccion === seccion));
  document.querySelectorAll('#sub-nav button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === estado.vista));
  $('sub-nav').classList.toggle('oculto', seccion !== 'coleccion');

  if (seccion === 'coleccion') {
    mostrarVista(estado.vista);
    if (estado.vista === 'album') pintarAlbum();
  } else if (seccion === 'tienda') {
    mostrarVista('tienda');
    pintarTienda();
  } else if (seccion === 'cambios') {
    mostrarVista('cambios');
    cargarCambios();
  } else if (seccion === 'top') {
    mostrarVista('top');
    cargarRanking();
  } else {
    mostrarVista('perfil');
    pintarPerfil();
    if (!estado.ranking) cargarRanking().then(pintarPerfil);
  }
}

// ------------------------------------------------------------------
// Datos
// ------------------------------------------------------------------
async function cargar() {
  try {
    const datos = await api('/api/yo');
    estado.desfase = new Date(datos.ahora).getTime() - Date.now();
    estado.datos = datos;
    document.title = datos.nombre_coleccion;

    if (!datos.identidad) {
      $('barra-top').classList.add('oculto');
      $('navegacion').classList.add('oculto');
      mostrarVista('identidad');
      return;
    }
    $('barra-top').classList.remove('oculto');
    $('navegacion').classList.remove('oculto');

    pintarEnergia();
    pintarPacks();
    pintarReserva();
    $('total-cartas').textContent = datos.copias.length;
    pintarGloboCambios(datos.intercambios_pendientes);
    pintarPolvo();
    irA(estado.seccion, estado.vista);
  } catch (e) {
    console.error(e);
    $('texto-error').textContent = e.message || 'No se pudo conectar.';
    mostrarVista('error');
  }
}

async function ping() {
  if (!estado.datos?.identidad || estado.abriendo) return;
  try {
    const r = await api('/api/ping');
    estado.datos.energia = r.energia;
    estado.desfase = new Date(r.ahora).getTime() - Date.now();
    pintarEnergia();
    pintarPacks();
    if (r.intercambios_pendientes > (estado.datos.intercambios_pendientes || 0)) {
      avisar('🔄 ¡Tienes una nueva propuesta de intercambio!');
      if (estado.seccion === 'cambios') cargarCambios();
    }
    estado.datos.intercambios_pendientes = r.intercambios_pendientes;
    pintarGloboCambios(r.intercambios_pendientes);
    if (r.sobres_sin_abrir > estado.datos.reserva.length) {
      avisar('🎁 ¡Has recibido un sobre! Míralo en tu Reserva');
      await cargar();
    }
  } catch (e) {
    console.warn('ping', e);
  }
}

// ------------------------------------------------------------------
// Energía
// ------------------------------------------------------------------
function ahora() {
  return Date.now() + estado.desfase;
}

function textoTiempo(ms) {
  const min = Math.max(0, Math.ceil(ms / 60000));
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

function pintarEnergia() {
  const e = estado.datos?.energia;
  if (!e) return;

  // Si ya ha pasado la hora de recarga, pedimos el dato nuevo al servidor
  if (e.siguiente_en && new Date(e.siguiente_en).getTime() <= ahora() && Date.now() - (estado.ultimoAuto || 0) > 15000) {
    estado.ultimoAuto = Date.now();
    ping();
  }

  $('energia-texto').textContent = `${e.energia}/${e.maximo}`;
  let parcial = 0;
  if (e.siguiente_en) {
    const falta = new Date(e.siguiente_en).getTime() - ahora();
    parcial = 1 - falta / (e.recarga_min * 60000);
    $('energia-reloj').textContent = textoTiempo(falta);
  } else {
    $('energia-reloj').textContent = '';
  }
  $('energia-relleno').style.width = Math.min(100, ((e.energia + Math.max(0, parcial)) / e.maximo) * 100) + '%';
}

function explicarEnergia() {
  const e = estado.datos?.energia;
  const caja = crear('div');
  caja.appendChild(crear('h3', null, '¿Cómo funcionan los sobres gratis?'));
  caja.appendChild(crear('p', null, 'La energía se recarga con el tiempo y se acumula hasta un máximo. Cada sobre gratis cuesta 1 de energía.'));
  const tabla = crear('table', 'tabla-simple');
  tabla.innerHTML = '<thead><tr><th>Nivel</th><th>Recarga</th><th>Máximo</th></tr></thead>';
  const cuerpo = crear('tbody');
  const fila = crear('tr', 'yo');
  const nivel = crear('td');
  nivel.append('Espectador ');
  nivel.appendChild(crear('span', 'chip', 'TÚ'));
  fila.append(nivel, crear('td', null, `1 / ${e?.recarga_min ?? '?'} min`), crear('td', null, String(e?.maximo ?? '?')));
  cuerpo.appendChild(fila);
  tabla.appendChild(cuerpo);
  caja.appendChild(tabla);
  caja.appendChild(crear('p', 'pequeno', 'Además, el streamer puede regalar sobres durante el directo: aparecerán en tu Reserva.'));
  const ok = crear('button', 'btn', 'Entendido');
  ok.style.width = '100%';
  caja.appendChild(ok);
  const cerrar = abrirModal(caja, $('app'));
  ok.addEventListener('click', cerrar);
}

// ------------------------------------------------------------------
// Packs (gratis con energía) y Reserva (regalados / sin abrir)
// ------------------------------------------------------------------
function pintarPacks() {
  const lista = $('lista-packs');
  lista.innerHTML = '';
  const { packs, energia } = estado.datos;
  $('packs-vacio').classList.toggle('oculto', packs.length > 0);

  for (const pack of packs) {
    const sinEnergia = energia.energia < 1;
    const item = crear('button', 'item-pack' + (sinEnergia ? ' bloqueado' : ''));
    item.appendChild(elementoPack(pack));
    item.appendChild(crear('div', 'nombre', pack.nombre));
    const coste = crear('span', 'coste');
    if (sinEnergia) {
      coste.appendChild(icono('reloj'));
      coste.append(energia.siguiente_en ? textoTiempo(new Date(energia.siguiente_en).getTime() - ahora()) : '—');
    } else {
      coste.append('GRATIS · ');
      coste.appendChild(icono('rayo'));
      coste.append('1');
    }
    coste.querySelectorAll('svg').forEach((s) => { s.style.width = '11px'; s.style.height = '11px'; });
    item.appendChild(coste);
    item.addEventListener('click', () => {
      if (sinEnergia) {
        avisar('No te queda energía. Mira el reloj de arriba para saber cuándo se recarga.', true);
        return;
      }
      abrirConEnergia(pack);
    });
    lista.appendChild(item);
  }
}

const TEXTO_ORIGEN = { regalo: 'Regalo', drop_aleatorio: 'Drop', canje_puntos: 'Canje', energia: 'Sin terminar' };

function pintarReserva() {
  const lista = $('lista-reserva');
  lista.innerHTML = '';
  const reserva = estado.datos.reserva;
  $('reserva-vacio').classList.toggle('oculto', reserva.length > 0);
  $('globo-reserva').textContent = reserva.length;
  $('globo-reserva').classList.toggle('oculto', reserva.length === 0);

  for (const sobre of reserva) {
    const item = crear('button', 'item-pack');
    item.appendChild(elementoPack(sobre.tipos_sobre));
    item.appendChild(crear('div', 'nombre', sobre.tipos_sobre.nombre));
    item.appendChild(crear('div', 'origen', TEXTO_ORIGEN[sobre.origen] || ''));
    item.addEventListener('click', () => abrirSobre(sobre.id, sobre.tipos_sobre));
    lista.appendChild(item);
  }
}

// ------------------------------------------------------------------
// Apertura
// ------------------------------------------------------------------
async function abrirConEnergia(pack) {
  let sobreId = null;
  await lanzarApertura(pack, async () => {
    const r = await api('/api/sobres/energia', { method: 'POST', body: { tipo_sobre_id: pack.id } });
    estado.datos.energia = r.energia;
    pintarEnergia();
    sobreId = r.sobre_id;
    return api('/api/sobres/abrir', { method: 'POST', body: { sobre_id: sobreId } });
  }, () => sobreId);
}

async function abrirSobre(id, tipo) {
  await lanzarApertura(tipo, () => api('/api/sobres/abrir', { method: 'POST', body: { sobre_id: id } }), () => id);
}

async function lanzarApertura(tipo, preparar, idSobre) {
  if (estado.abriendo) return;
  estado.abriendo = true;
  const yaTengo = new Set(estado.datos.copias.map((c) => c.carta_id));
  try {
    const accion = await reproducirApertura($('app'), {
      tipo,
      preparar,
      elegir: (posicion) => api('/api/sobres/elegir', { method: 'POST', body: { sobre_id: idSobre(), posicion } }),
      esPrimera: (carta) => !yaTengo.has(carta.id),
      botones: [
        { texto: 'Ver en el álbum', valor: 'album' },
        { texto: 'Continuar', valor: 'continuar', primario: true },
      ],
    });
    if (accion === 'album') {
      estado.orden = 'fecha';
      estado.filtro = 'mias';
      estado.pagina = 1;
      document.querySelectorAll('#orden button').forEach((b) => b.classList.toggle('activo', b.dataset.orden === 'fecha'));
      document.querySelectorAll('#filtro button').forEach((b) => b.classList.toggle('activo', b.dataset.filtro === 'mias'));
      estado.vista = 'album';
    }
  } finally {
    estado.abriendo = false;
    estado.ranking = null;
    await cargar();
  }
}

// ------------------------------------------------------------------
// Álbum
// ------------------------------------------------------------------
function agruparMias() {
  const mias = new Map();
  for (const c of estado.datos.copias) {
    if (!mias.has(c.carta_id)) mias.set(c.carta_id, { series: [], ultima: c.obtenida_en, primera: c.obtenida_en });
    const g = mias.get(c.carta_id);
    g.series.push(c.numero_serie);
    if (c.obtenida_en > g.ultima) g.ultima = c.obtenida_en;
    if (c.obtenida_en < g.primera) g.primera = c.obtenida_en;
  }
  return mias;
}

function pintarAlbum() {
  const { catalogo } = estado.datos;
  const mias = agruparMias();

  // Progreso
  const pct = catalogo.length ? Math.round((mias.size / catalogo.length) * 100) : 0;
  $('progreso-pct').textContent = pct + '%';
  $('progreso-barra').style.width = pct + '%';

  document.querySelectorAll('#orden button').forEach((b) => b.classList.toggle('activo', b.dataset.orden === estado.orden));
  document.querySelectorAll('#filtro button').forEach((b) => b.classList.toggle('activo', b.dataset.filtro === estado.filtro));

  let lista = catalogo.map((carta) => ({ carta, mia: mias.get(carta.id) }));
  if (estado.filtro === 'mias') lista = lista.filter((x) => x.mia);

  const porRareza = (a, b) => RAREZAS[b.carta.rareza].orden - RAREZAS[a.carta.rareza].orden || a.carta.id - b.carta.id;
  if (estado.orden === 'rareza') lista.sort(porRareza);
  if (estado.orden === 'numero') lista.sort((a, b) => a.carta.id - b.carta.id);
  if (estado.orden === 'fecha') lista.sort((a, b) => (b.mia?.ultima || '').localeCompare(a.mia?.ultima || '') || a.carta.id - b.carta.id);

  // Paginación según el ancho disponible
  const anchoAlbum = $('album').clientWidth || $('contenido').clientWidth - 28;
  const columnas = Math.max(3, Math.floor((anchoAlbum - 24 + 10) / (92 + 10)));
  const porPagina = columnas * 3;
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  estado.pagina = Math.min(Math.max(1, estado.pagina), paginas);
  $('pag-texto').textContent = `Página ${estado.pagina} / ${paginas}`;
  $('pag-ant').disabled = estado.pagina <= 1;
  $('pag-sig').disabled = estado.pagina >= paginas;

  const album = $('album');
  album.innerHTML = '';
  const vacio = lista.length === 0;
  $('album-vacio').classList.toggle('oculto', !vacio);
  album.classList.toggle('oculto', vacio);

  for (const { carta, mia } of lista.slice((estado.pagina - 1) * porPagina, estado.pagina * porPagina)) {
    if (!mia) {
      const h = crear('div', 'hueco-vacio');
      h.appendChild(crear('span', null, numero3(carta.id)));
      album.appendChild(h);
      continue;
    }
    const h = crear('div', 'hueco-album');
    h.appendChild(elementoCarta(carta, { nueva: esNueva(mia.ultima), serie: mia.series.length === 1 ? mia.series[0] : null }));
    if (mia.series.length > 1) h.appendChild(crear('span', 'multi', '×' + mia.series.length));
    h.addEventListener('click', () => verDetalle(carta, mia));
    album.appendChild(h);
  }
}

function verDetalle(carta, mia) {
  const capa = crear('div', 'detalle');
  const cerrar = crear('button', 'btn redondo cerrar');
  cerrar.appendChild(icono('cerrar'));
  cerrar.addEventListener('click', () => capa.remove());
  capa.addEventListener('click', (e) => e.target === capa && capa.remove());

  const info = crear('div', 'info');
  info.appendChild(crear('div', 'antetitulo', 'En la colección'));
  info.appendChild(crear('div', 'canal degradado-texto', estado.datos.nombre_coleccion));
  info.appendChild(crear('div', 'fecha', 'Obtenida el ' + fechaCorta(mia.primera)));

  const zona = crear('div', 'zona-carta');
  zona.appendChild(inclinable(elementoCarta(carta, { serie: mia.series.length === 1 ? mia.series[0] : null })));
  const lupa = crear('button', 'btn redondo');
  lupa.title = 'Ampliar';
  lupa.appendChild(icono('zoom'));
  lupa.addEventListener('click', () => ampliar(carta, mia));
  zona.appendChild(lupa);

  capa.append(cerrar, info, zona);
  const valor = estado.datos.polvo_por_rareza?.[carta.rareza] ?? 0;
  const acciones = crear('div', 'acciones-detalle');
  const desmontarBtn = crear('button', 'btn', `Desmontar 1 copia (+✦ ${valor})`);
  desmontarBtn.title = mia.series.length > 1 ? 'Se desmonta la copia con el número de serie más alto' : 'Es tu única copia';
  desmontarBtn.addEventListener('click', async () => {
    if (!desmontarBtn.dataset.ok) {
      desmontarBtn.dataset.ok = '1';
      desmontarBtn.textContent = mia.series.length > 1 ? '¿Seguro? Pulsa otra vez' : '¡Es tu única copia! Pulsa otra vez';
      setTimeout(() => { delete desmontarBtn.dataset.ok; desmontarBtn.textContent = `Desmontar 1 copia (+✦ ${valor})`; }, 3000);
      return;
    }
    const copia = estado.datos.copias.filter((c) => c.carta_id === carta.id).sort((a, b) => b.numero_serie - a.numero_serie)[0];
    desmontarBtn.disabled = true;
    try {
      const r = await api('/api/polvo/desmontar', { method: 'POST', body: { copias: [copia.id] } });
      Sonido.play('polvo');
      avisar(`✨ +${r.ganado} de polvo (tienes ${r.polvo})`);
      capa.remove();
      await cargar();
    } catch (e) {
      avisar(e.message, true);
      desmontarBtn.disabled = false;
    }
  });
  acciones.appendChild(desmontarBtn);
  const limite = carta.limite_copias ? '/' + carta.limite_copias : '';
  if (mia.series.length > 1 || carta.limite_copias) {
    capa.appendChild(crear('div', 'antetitulo', `Tienes ${mia.series.length} ${mia.series.length === 1 ? 'copia' : 'copias'}`));
    const series = crear('div', 'series');
    [...mia.series].sort((a, b) => a - b).forEach((n) => series.appendChild(crear('span', null, '#' + n + limite)));
    capa.appendChild(series);
  }
  capa.appendChild(acciones);
  $('app').appendChild(capa);
}

// Vista ampliada: rueda o doble clic para hacer zoom, arrastrar para moverse
function ampliar(carta, mia) {
  const capa = crear('div', 'zoom');
  const lienzo = crear('div', 'lienzo');
  lienzo.appendChild(elementoCarta(carta, { serie: mia.series.length === 1 ? mia.series[0] : null }));
  const cerrar = crear('button', 'btn redondo cerrar');
  cerrar.appendChild(icono('cerrar'));
  cerrar.addEventListener('click', () => capa.remove());
  capa.append(lienzo, cerrar, crear('div', 'pista', 'Rueda o doble clic para hacer zoom · arrastra para moverte'));
  $('app').appendChild(capa);

  let escala = 1, x = 0, y = 0, arrastre = null;
  const aplicar = () => { lienzo.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${escala})`; };
  aplicar();
  capa.addEventListener('wheel', (e) => {
    e.preventDefault();
    escala = Math.min(4, Math.max(1, escala * (e.deltaY < 0 ? 1.15 : 0.87)));
    if (escala === 1) { x = 0; y = 0; }
    aplicar();
  }, { passive: false });
  capa.addEventListener('dblclick', () => {
    escala = escala > 1 ? 1 : 2.2;
    if (escala === 1) { x = 0; y = 0; }
    aplicar();
  });
  capa.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cerrar')) return;
    arrastre = { px: e.clientX - x, py: e.clientY - y };
    capa.classList.add('arrastrando');
    capa.setPointerCapture(e.pointerId);
  });
  capa.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    x = e.clientX - arrastre.px;
    y = e.clientY - arrastre.py;
    aplicar();
  });
  capa.addEventListener('pointerup', () => { arrastre = null; capa.classList.remove('arrastrando'); });
}

// ------------------------------------------------------------------
// Top semanal
// ------------------------------------------------------------------
async function cargarRanking() {
  try {
    estado.ranking = await api('/api/ranking');
    if (estado.seccion === 'top') pintarRanking();
  } catch (e) {
    avisar('No se pudo cargar la clasificación', true);
  }
}

function inicial(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase();
}

function pintarRanking() {
  const { top } = estado.ranking;
  const podio = $('podio');
  const lista = $('lista-ranking');
  podio.innerHTML = '';
  lista.innerHTML = '';
  $('top-vacio').classList.toggle('oculto', top.length > 0);

  // Podio: 2º - 1º - 3º
  for (const pos of [2, 1, 3]) {
    const f = top[pos - 1];
    const p = crear('div', 'puesto p' + pos);
    if (f) {
      const av = crear('div', 'av', inicial(f.nombre));
      av.appendChild(crear('span', 'medalla', String(pos)));
      p.append(av, crear('div', 'nombre', f.nombre), crear('div', 'num', String(f.sobres)), crear('div', 'lbl', 'SOBRES ABIERTOS'));
    }
    p.appendChild(crear('div', 'base'));
    podio.appendChild(p);
  }

  const maximo = Number(top[0]?.sobres || 1);
  for (const f of top.slice(3)) lista.appendChild(filaRanking(f, maximo));

  // Si estoy fuera del top 50, me añado al final
  const yo = estado.ranking.yo;
  if (yo && yo.posicion > top.length) {
    lista.appendChild(filaRanking({ posicion: yo.posicion, nombre: estado.datos.usuario.nombre || 'Tú', sobres: yo.sobres, soy_yo: true }, maximo));
  }
}

function filaRanking(f, maximo) {
  const fila = crear('div', 'fila-ranking' + (f.soy_yo ? ' yo' : ''));
  const quien = crear('div', 'quien');
  const nombre = crear('b', null, f.nombre);
  if (f.soy_yo) nombre.appendChild(crear('span', 'tu', 'TÚ'));
  const barra = crear('div', 'mini-barra');
  const relleno = crear('div');
  relleno.style.width = Math.max(4, (Number(f.sobres) / maximo) * 100) + '%';
  barra.appendChild(relleno);
  quien.append(nombre, barra);
  fila.append(crear('div', 'pos', String(f.posicion)), quien, crear('div', 'cuantos', String(f.sobres)));
  return fila;
}

// ------------------------------------------------------------------
// Perfil
// ------------------------------------------------------------------
function pintarPerfil() {
  const { usuario, copias, catalogo } = estado.datos;
  const mias = agruparMias();
  $('perfil-nombre').textContent = usuario.nombre || 'Coleccionista';
  $('perfil-avatar').textContent = inicial(usuario.nombre);
  $('perfil-sub').textContent = 'Coleccionista · ' + estado.datos.nombre_coleccion;

  const limitadas = copias.filter((c) => catalogo.find((k) => k.id === c.carta_id)?.limite_copias).length;
  const pct = catalogo.length ? Math.round((mias.size / catalogo.length) * 100) : 0;
  const stats = [
    [copias.length, 'Cartas'],
    [mias.size, 'Distintas'],
    [pct + '%', 'Álbum completado'],
    [estado.ranking?.yo?.sobres ?? 0, 'Sobres esta semana'],
    [limitadas, 'Ed. limitadas'],
    [estado.ranking?.yo ? '#' + estado.ranking.yo.posicion : '—', 'Puesto semanal'],
  ];
  const caja = $('perfil-stats');
  caja.innerHTML = '';
  for (const [valor, texto] of stats) {
    const s = crear('div', 'stat');
    s.append(crear('b', null, String(valor)), crear('span', null, texto));
    caja.appendChild(s);
  }

  const barras = $('perfil-rarezas');
  barras.innerHTML = '';
  for (const [clave, info] of Object.entries(RAREZAS)) {
    const total = catalogo.filter((c) => c.rareza === clave).length;
    if (!total) continue;
    const tengo = catalogo.filter((c) => c.rareza === clave && mias.has(c.id)).length;
    const fila = crear('div', 'barra-rareza r-' + clave);
    const b = crear('div', 'b');
    const relleno = crear('div');
    relleno.style.width = (tengo / total) * 100 + '%';
    b.appendChild(relleno);
    const nombre = crear('span');
    nombre.append(crear('span', 'punto'), ' ' + info.nombre);
    fila.append(nombre, b, crear('span', 'n', `${tengo}/${total}`));
    barras.appendChild(fila);
  }

  // Carta más rara: mayor rareza, luego edición limitada, luego número de serie más bajo
  const mejor = copias
    .map((c) => ({ copia: c, carta: catalogo.find((k) => k.id === c.carta_id) }))
    .filter((x) => x.carta)
    .sort((a, b) =>
      RAREZAS[b.carta.rareza].orden - RAREZAS[a.carta.rareza].orden ||
      (b.carta.limite_copias ? 1 : 0) - (a.carta.limite_copias ? 1 : 0) ||
      a.copia.numero_serie - b.copia.numero_serie,
    )[0];
  const zona = $('perfil-mejor');
  zona.innerHTML = '';
  if (mejor) {
    zona.appendChild(inclinable(elementoCarta(mejor.carta, { serie: mejor.copia.numero_serie })));
    const t = crear('div');
    t.appendChild(crear('h3', 'titulo-display', mejor.carta.nombre));
    t.appendChild(crear('span', 'etiqueta-rareza r-' + mejor.carta.rareza, textoRareza(mejor.carta.rareza)));
    t.appendChild(crear('p', 'gris pequeno', 'Conseguida el ' + fechaCorta(mejor.copia.obtenida_en)));
    zona.appendChild(t);
  } else {
    zona.appendChild(crear('p', 'gris', 'Aún no tienes cartas.'));
  }
}

// ------------------------------------------------------------------
// Intercambios
// ------------------------------------------------------------------
estado.cambios = null;
estado.tabCambios = 'recibidos';

function pintarGloboCambios(n) {
  $('globo-cambios').textContent = n || 0;
  $('globo-cambios').classList.toggle('oculto', !n);
}

$('tabs-cambios').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  estado.tabCambios = b.dataset.tab;
  pintarCambios();
});
$('chk-acepta').addEventListener('change', async (e) => {
  try {
    await api('/api/intercambios/preferencia', { method: 'POST', body: { acepta: e.target.checked } });
    avisar(e.target.checked ? 'Ahora puedes recibir propuestas' : 'Ya no recibirás propuestas nuevas');
  } catch (err) {
    e.target.checked = !e.target.checked;
    avisar(err.message, true);
  }
});
$('btn-crear-cambio').addEventListener('click', () => asistenteCambio());

async function cargarCambios() {
  try {
    estado.cambios = await api('/api/intercambios');
    $('chk-acepta').checked = estado.cambios.acepta_intercambios;
    estado.datos.intercambios_pendientes = estado.cambios.recibidos.length;
    pintarGloboCambios(estado.cambios.recibidos.length);
    pintarCambios();
  } catch (e) {
    avisar('No se pudieron cargar los intercambios', true);
  }
}

function minis(lista) {
  const caja = crear('div', 'minis');
  if (!lista.length) caja.appendChild(crear('span', 'nada', 'Nada'));
  for (const c of lista) if (c.carta) caja.appendChild(elementoCarta(c.carta, { serie: c.numero_serie }));
  return caja;
}

const TEXTO_ESTADO = { aceptado: 'Aceptado', rechazado: 'Rechazado', cancelado: 'Cancelado', fallido: 'Anulado' };

function pintarCambios() {
  const c = estado.cambios;
  if (!c) return;
  document.querySelectorAll('#tabs-cambios button').forEach((b) => b.classList.toggle('activo', b.dataset.tab === estado.tabCambios));
  $('n-recibidos').textContent = c.recibidos.length;
  $('n-recibidos').classList.toggle('oculto', !c.recibidos.length);
  $('n-enviados').textContent = c.enviados.length ? `(${c.enviados.length})` : '';

  const lista = $('lista-cambios');
  lista.innerHTML = '';
  const items = c[estado.tabCambios];
  if (!items.length) {
    const textos = {
      recibidos: 'No tienes propuestas pendientes.',
      enviados: 'No tienes propuestas enviadas esperando respuesta.',
      historial: 'Aún no has hecho ningún intercambio.',
    };
    lista.appendChild(crear('div', 'vacio', textos[estado.tabCambios]));
    return;
  }

  for (const t of items) {
    const el = crear('div', 'cambio');
    const cab = crear('div', 'cambio-cab');
    const quien = crear('span');
    if (t.estado === 'pendiente') {
      if (t.enviado_por_mi) quien.append('Propuesta a ', crear('b', null, t.otro));
      else quien.append(crear('b', null, t.otro), ' te propone');
    } else {
      quien.append('Con ', crear('b', null, t.otro), ' ');
      quien.appendChild(crear('span', 'estado-cambio ' + t.estado, TEXTO_ESTADO[t.estado] || t.estado));
    }
    cab.append(quien, crear('span', 'cuando', fechaCorta(t.resuelto_en || t.creado_en)));

    const lados = crear('div', 'cambio-lados');
    const recibo = crear('div', 'lado recibo');
    recibo.append(crear('div', 'antetitulo', 'Recibes'), minis(t.recibo));
    const doy = crear('div', 'lado doy');
    doy.append(crear('div', 'antetitulo', 'Das'), minis(t.doy));
    const flecha = crear('div', 'flecha');
    flecha.appendChild(icono('cambio'));
    lados.append(recibo, flecha, doy);
    el.append(cab, lados);

    if (t.estado === 'pendiente') {
      const botones = crear('div', 'cambio-botones');
      const accion = (texto, valor, clase) => {
        const b = crear('button', 'btn ' + clase, texto);
        b.addEventListener('click', () => responderCambio(t.id, valor, b));
        botones.appendChild(b);
      };
      if (t.enviado_por_mi) accion('Cancelar', 'cancelar', 'fantasma');
      else {
        accion('Rechazar', 'rechazar', 'fantasma');
        accion('Aceptar', 'aceptar', 'primario');
      }
      el.appendChild(botones);
    }
    lista.appendChild(el);
  }
}

async function responderCambio(id, accion, boton) {
  boton.disabled = true;
  try {
    await api('/api/intercambios/responder', { method: 'POST', body: { id, accion } });
    avisar({ aceptar: '✅ ¡Intercambio hecho! Las cartas ya están en tu álbum', rechazar: 'Propuesta rechazada', cancelar: 'Propuesta cancelada' }[accion]);
    if (accion === 'aceptar') await cargar();
  } catch (e) {
    avisar(e.message, true);
  }
  await cargarCambios();
}

// Asistente: 1) a quién  2) qué ofreces  3) qué pides  4) confirmar
function asistenteCambio() {
  const sel = { persona: null, ofrezco: new Set(), pido: new Set(), suyas: null };
  let paso = 1;

  const capa = crear('div', 'asistente');
  const cab = crear('div', 'asistente-cab');
  const cerrar = crear('button', 'btn redondo fantasma');
  cerrar.appendChild(icono('cerrar'));
  cerrar.addEventListener('click', () => capa.remove());
  cab.append(crear('h3', null, 'Nuevo intercambio'), cerrar);
  const pasos = crear('div', 'pasos');
  for (let i = 0; i < 4; i++) pasos.appendChild(crear('div'));
  const cuerpo = crear('div', 'asistente-cuerpo');
  const pie = crear('div', 'asistente-pie');
  const atras = crear('button', 'btn fantasma', 'Atrás');
  const siguiente = crear('button', 'btn primario', 'Siguiente');
  pie.append(atras, crear('div', 'espacio'), siguiente);
  capa.append(cab, pasos, cuerpo, pie);
  $('app').appendChild(capa);

  atras.addEventListener('click', () => { paso--; pintar(); });
  siguiente.addEventListener('click', async () => {
    if (paso < 4) { paso++; pintar(); return; }
    siguiente.disabled = true;
    try {
      await api('/api/intercambios', { method: 'POST', body: { para: sel.persona.id, ofrecidas: [...sel.ofrezco], pedidas: [...sel.pido] } });
      avisar(`📨 Propuesta enviada a ${sel.persona.nombre}`);
      capa.remove();
      estado.tabCambios = 'enviados';
      cargarCambios();
    } catch (e) {
      avisar(e.message, true);
      siguiente.disabled = false;
    }
  });

  function rejillaSeleccion(copias, conjunto, alCambiar) {
    const rejilla = crear('div', 'rejilla-sel');
    for (const c of copias) {
      if (!c.carta) continue;
      const item = crear('div', 'sel-carta' + (conjunto.has(c.id) ? ' sel' : ''));
      item.appendChild(elementoCarta(c.carta, { serie: c.numero_serie }));
      item.appendChild(crear('div', 'marca-sel'));
      const tick = crear('div', 'tick');
      tick.appendChild(icono('check'));
      item.appendChild(tick);
      item.addEventListener('click', () => {
        if (conjunto.has(c.id)) conjunto.delete(c.id);
        else if (conjunto.size >= 5) return avisar('Máximo 5 cartas por lado', true);
        else conjunto.add(c.id);
        item.classList.toggle('sel', conjunto.has(c.id));
        alCambiar();
      });
      rejilla.appendChild(item);
    }
    return rejilla;
  }

  function misCopias() {
    const porId = new Map(estado.datos.catalogo.map((c) => [c.id, c]));
    return estado.datos.copias
      .map((c) => ({ id: c.id, numero_serie: c.numero_serie, carta: porId.get(c.carta_id) }))
      .sort((a, b) => RAREZAS[b.carta?.rareza]?.orden - RAREZAS[a.carta?.rareza]?.orden);
  }

  async function pintar() {
    pasos.querySelectorAll('div').forEach((d, i) => d.classList.toggle('hecho', i < paso));
    atras.classList.toggle('oculto', paso === 1);
    siguiente.textContent = paso === 4 ? 'Enviar propuesta' : 'Siguiente';
    cuerpo.innerHTML = '';
    const actualizar = () => {
      siguiente.disabled =
        (paso === 1 && !sel.persona) ||
        (paso === 4 && sel.ofrezco.size + sel.pido.size === 0);
      contador.textContent = paso === 2 ? `${sel.ofrezco.size}/5 elegidas` : paso === 3 ? `${sel.pido.size}/5 elegidas` : '';
    };
    const contador = crear('div', 'contador-sel');

    if (paso === 1) {
      cuerpo.appendChild(crear('h4', null, '¿Con quién?'));
      cuerpo.appendChild(crear('p', 'gris pequeno', 'Busca a otro espectador del canal.'));
      const buscador = crear('div', 'buscador');
      const input = document.createElement('input');
      input.placeholder = 'Nombre de Twitch…';
      buscador.append(icono('buscar'), input);
      const resultados = crear('div');
      cuerpo.append(buscador, resultados);
      const buscar = async () => {
        try {
          const r = await api('/api/usuarios?q=' + encodeURIComponent(input.value.trim()));
          resultados.innerHTML = '';
          if (!r.usuarios.length) resultados.appendChild(crear('p', 'gris pequeno', 'No se ha encontrado a nadie.'));
          for (const u of r.usuarios) {
            const b = crear('button', 'persona' + (sel.persona?.id === u.id ? ' activo' : ''));
            b.append(crear('span', 'av', inicial(u.nombre)), crear('b', null, u.nombre));
            b.addEventListener('click', () => {
              if (sel.persona?.id !== u.id) { sel.pido.clear(); sel.suyas = null; }
              sel.persona = u;
              paso = 2;
              pintar();
            });
            resultados.appendChild(b);
          }
        } catch (e) {
          avisar(e.message, true);
        }
      };
      let t;
      input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 300); });
      buscar();
      setTimeout(() => input.focus(), 50);
    }

    if (paso === 2) {
      cuerpo.appendChild(crear('h4', null, '¿Qué ofreces?'));
      cuerpo.appendChild(crear('p', 'gris pequeno', `Elige hasta 5 cartas tuyas para ${sel.persona.nombre}. Puedes no ofrecer nada.`));
      cuerpo.appendChild(contador);
      const mias = misCopias();
      if (!mias.length) cuerpo.appendChild(crear('p', 'gris', 'Todavía no tienes cartas.'));
      cuerpo.appendChild(rejillaSeleccion(mias, sel.ofrezco, actualizar));
    }

    if (paso === 3) {
      cuerpo.appendChild(crear('h4', null, '¿Qué pides?'));
      cuerpo.appendChild(crear('p', 'gris pequeno', `Elige hasta 5 cartas de ${sel.persona.nombre}. Puedes no pedir nada (sería un regalo).`));
      cuerpo.appendChild(contador);
      if (!sel.suyas) {
        cuerpo.appendChild(crear('div', 'centro', '…'));
        try {
          sel.suyas = (await api('/api/usuarios/coleccion?id=' + encodeURIComponent(sel.persona.id))).copias;
        } catch (e) {
          avisar(e.message, true);
          paso = 1;
          return pintar();
        }
        if (paso !== 3) return;
        cuerpo.lastChild.remove();
      }
      if (!sel.suyas.length) cuerpo.appendChild(crear('p', 'gris', 'Este espectador aún no tiene cartas.'));
      cuerpo.appendChild(rejillaSeleccion(sel.suyas, sel.pido, actualizar));
    }

    if (paso === 4) {
      cuerpo.appendChild(crear('h4', null, 'Revisa tu propuesta'));
      cuerpo.appendChild(crear('p', 'gris pequeno', `${sel.persona.nombre} podrá aceptarla o rechazarla cuando entre.`));
      const mias = misCopias().filter((c) => sel.ofrezco.has(c.id));
      const suyas = (sel.suyas || []).filter((c) => sel.pido.has(c.id));
      const lados = crear('div', 'cambio-lados');
      lados.style.marginTop = '14px';
      const recibo = crear('div', 'lado recibo');
      recibo.append(crear('div', 'antetitulo', 'Recibes'), minis(suyas));
      const doy = crear('div', 'lado doy');
      doy.append(crear('div', 'antetitulo', 'Das'), minis(mias));
      const flecha = crear('div', 'flecha');
      flecha.appendChild(icono('cambio'));
      lados.append(recibo, flecha, doy);
      cuerpo.appendChild(lados);
      if (!mias.length && !suyas.length) cuerpo.appendChild(crear('p', 'gris', 'Elige al menos una carta (vuelve atrás).'));
    }
    actualizar();
  }
  pintar();
}

// ------------------------------------------------------------------
// Polvo y tienda
// ------------------------------------------------------------------
function pintarPolvo() {
  const polvo = estado.datos?.usuario?.polvo ?? 0;
  $('polvo-texto').textContent = polvo.toLocaleString('es-ES');
  $('saldo-polvo').textContent = polvo.toLocaleString('es-ES');
}

function pintarTienda() {
  const { tienda, usuario, polvo_por_rareza } = estado.datos;
  pintarPolvo();
  const lista = $('lista-tienda');
  lista.innerHTML = '';
  $('tienda-vacio').classList.toggle('oculto', tienda.length > 0);
  for (const t of tienda) {
    const falta = t.precio_polvo - usuario.polvo;
    const item = crear('button', 'item-pack' + (falta > 0 ? ' bloqueado' : ''));
    item.appendChild(elementoPack(t));
    item.appendChild(crear('div', 'nombre', t.nombre));
    item.appendChild(crear('span', 'precio', t.precio_polvo.toLocaleString('es-ES')));
    if (falta > 0) item.appendChild(crear('div', 'falta', `Te faltan ${falta.toLocaleString('es-ES')}`));
    item.addEventListener('click', () => {
      if (falta > 0) return avisar(`Te faltan ✦ ${falta} de polvo. Desmonta cartas repetidas para conseguirlo.`, true);
      comprarSobre(t);
    });
    lista.appendChild(item);
  }

  const tabla = $('tabla-polvo');
  tabla.innerHTML = '';
  for (const [r, info] of Object.entries(RAREZAS)) {
    const celda = crear('div', 'r-' + r);
    celda.append(crear('b', null, '✦ ' + (polvo_por_rareza?.[r] ?? 0)), crear('span', null, info.nombre));
    tabla.appendChild(celda);
  }
}

async function comprarSobre(tipo) {
  let sobreId = null;
  await lanzarApertura(tipo, async () => {
    const r = await api('/api/tienda/comprar', { method: 'POST', body: { tipo_sobre_id: tipo.id } });
    Sonido.play('compra');
    estado.datos.usuario.polvo = r.polvo;
    pintarPolvo();
    sobreId = r.sobre_id;
    return api('/api/sobres/abrir', { method: 'POST', body: { sobre_id: sobreId } });
  }, () => sobreId);
}

// Elegir qué copias desmontar. Por defecto: todas las repetidas
// (se queda la copia con el número de serie más bajo de cada carta).
function asistenteDesmontar() {
  const porId = new Map(estado.datos.catalogo.map((c) => [c.id, c]));
  const valores = estado.datos.polvo_por_rareza || {};
  const copias = estado.datos.copias
    .map((c) => ({ ...c, carta: porId.get(c.carta_id) }))
    .filter((c) => c.carta)
    .sort((a, b) => RAREZAS[a.carta.rareza].orden - RAREZAS[b.carta.rareza].orden || a.carta.id - b.carta.id || a.numero_serie - b.numero_serie);

  const repetidas = () => {
    const vistas = new Set();
    const ids = new Set();
    for (const c of copias) {
      if (vistas.has(c.carta_id)) ids.add(c.id);
      vistas.add(c.carta_id);
    }
    return ids;
  };
  let elegidas = repetidas();

  const capa = crear('div', 'asistente');
  const cab = crear('div', 'asistente-cab');
  const cerrar = crear('button', 'btn redondo fantasma');
  cerrar.appendChild(icono('cerrar'));
  cerrar.addEventListener('click', () => capa.remove());
  cab.append(crear('h3', null, 'Desmontar cartas'), cerrar);
  const cuerpo = crear('div', 'asistente-cuerpo');
  const pie = crear('div', 'asistente-pie');
  const boton = crear('button', 'btn primario');
  boton.style.flex = '1';
  pie.appendChild(boton);
  capa.append(cab, cuerpo, pie);
  $('app').appendChild(capa);

  cuerpo.appendChild(crear('p', 'gris pequeno', 'Toca las cartas para elegir cuáles desmontar. Ya están marcadas tus repetidas (te quedas siempre la de número más bajo).'));
  const atajos = crear('div', 'atajos');
  const atajo = (texto, fn) => {
    const b = crear('button', 'chip', texto);
    b.addEventListener('click', () => { elegidas = fn(); pintar(); });
    atajos.appendChild(b);
  };
  atajo('Solo repetidas', repetidas);
  atajo('Repetidas comunes', () => new Set([...repetidas()].filter((id) => copias.find((c) => c.id === id).carta.rareza === 'comun')));
  atajo('Ninguna', () => new Set());
  const resumen = crear('div', 'resumen-desmontar');
  const rejilla = crear('div', 'rejilla-sel');
  cuerpo.append(atajos, resumen, rejilla);

  function pintar() {
    rejilla.innerHTML = '';
    for (const c of copias) {
      const item = crear('div', 'sel-carta' + (elegidas.has(c.id) ? ' sel' : ''));
      item.appendChild(elementoCarta(c.carta, { serie: c.numero_serie }));
      item.appendChild(crear('div', 'marca-sel'));
      const tick = crear('div', 'tick');
      tick.appendChild(icono('check'));
      item.appendChild(tick);
      item.addEventListener('click', () => {
        elegidas.has(c.id) ? elegidas.delete(c.id) : elegidas.add(c.id);
        pintar();
      });
      rejilla.appendChild(item);
    }
    if (!copias.length) rejilla.appendChild(crear('p', 'gris', 'No tienes cartas.'));

    const total = [...elegidas].reduce((s, id) => s + (valores[copias.find((c) => c.id === id).carta.rareza] ?? 0), 0);
    // ¿Alguna carta se queda sin ninguna copia?
    const perdidas = new Set();
    for (const c of copias) {
      if (!elegidas.has(c.id)) continue;
      const quedan = copias.filter((x) => x.carta_id === c.carta_id && !elegidas.has(x.id)).length;
      if (!quedan) perdidas.add(c.carta.nombre);
    }
    resumen.innerHTML = '';
    resumen.append(`${elegidas.size} ${elegidas.size === 1 ? 'carta elegida' : 'cartas elegidas'} → recibirás `, crear('b', null, `✦ ${total.toLocaleString('es-ES')}`));
    if (perdidas.size) resumen.appendChild(crear('div', 'peligro', `⚠ Te quedarás sin: ${[...perdidas].join(', ')}`));
    boton.textContent = elegidas.size ? `Desmontar ${elegidas.size} (+✦ ${total.toLocaleString('es-ES')})` : 'Elige cartas';
    boton.disabled = !elegidas.size;
    delete boton.dataset.ok;
  }

  boton.addEventListener('click', async () => {
    if (!boton.dataset.ok) {
      boton.dataset.ok = '1';
      boton.textContent = '¿Seguro? No se puede deshacer. Pulsa otra vez';
      return;
    }
    boton.disabled = true;
    try {
      const r = await api('/api/polvo/desmontar', { method: 'POST', body: { copias: [...elegidas] } });
      Sonido.play('polvo');
      avisar(`✨ +${r.ganado.toLocaleString('es-ES')} de polvo. Ahora tienes ${r.polvo.toLocaleString('es-ES')}`);
      capa.remove();
      await cargar();
    } catch (e) {
      avisar(e.message, true);
      boton.disabled = false;
    }
  });
  pintar();
}
