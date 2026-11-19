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
  zona.appendChild(elementoCarta(carta, { serie: mia.series.length === 1 ? mia.series[0] : null }));
  const lupa = crear('button', 'btn redondo');
  lupa.title = 'Ampliar';
  lupa.appendChild(icono('zoom'));
  lupa.addEventListener('click', () => ampliar(carta, mia));
  zona.appendChild(lupa);

  capa.append(cerrar, info, zona);
  const limite = carta.limite_copias ? '/' + carta.limite_copias : '';
  if (mia.series.length > 1 || carta.limite_copias) {
    capa.appendChild(crear('div', 'antetitulo', `Tienes ${mia.series.length} ${mia.series.length === 1 ? 'copia' : 'copias'}`));
    const series = crear('div', 'series');
    [...mia.series].sort((a, b) => a - b).forEach((n) => series.appendChild(crear('span', null, '#' + n + limite)));
    capa.appendChild(series);
  }
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
    zona.appendChild(elementoCarta(mejor.carta, { serie: mejor.copia.numero_serie }));
    const t = crear('div');
    t.appendChild(crear('h3', 'titulo-display', mejor.carta.nombre));
    t.appendChild(crear('span', 'etiqueta-rareza r-' + mejor.carta.rareza, textoRareza(mejor.carta.rareza)));
    t.appendChild(crear('p', 'gris pequeno', 'Conseguida el ' + fechaCorta(mejor.copia.obtenida_en)));
    zona.appendChild(t);
  } else {
    zona.appendChild(crear('p', 'gris', 'Aún no tienes cartas.'));
  }
}
