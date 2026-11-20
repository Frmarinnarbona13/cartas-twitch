// =====================================================================
// Código compartido: conexión con el backend y dibujo de cartas/sobres.
// =====================================================================

// Dirección del backend. Si la extensión se sirve desde Vercel (Local Test)
// se usa la misma web; si la aloja Twitch (Hosted Test / publicada), la fija.
const API_FIJA = 'https://cartas-twitch.vercel.app';
const API = location.hostname.endsWith('.ext-twitch.tv') ? API_FIJA : location.origin;

const RAREZAS = {
  comun: { nombre: 'Común', orden: 1 },
  rara: { nombre: 'Rara', orden: 2 },
  epica: { nombre: 'Épica', orden: 3 },
  legendaria: { nombre: 'Legendaria', orden: 4 },
  divina: { nombre: 'Divina', orden: 5 },
};

let tokenTwitch = null;

async function api(ruta, opciones = {}) {
  const r = await fetch(API + ruta, {
    method: opciones.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + tokenTwitch,
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(datos.mensaje || datos.error || 'Error ' + r.status);
    error.codigo = datos.error;
    throw error;
  }
  return datos;
}

// ------------------------------------------------------------------
// Utilidades de DOM
// ------------------------------------------------------------------
function crear(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto != null) el.textContent = texto;
  return el;
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function textoRareza(r) {
  return RAREZAS[r]?.nombre || r;
}

function numero3(n) {
  return '#' + String(n).padStart(3, '0');
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function esNueva(iso) {
  return iso && Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;
}

// Iconos (SVG en línea, sin dependencias)
const ICONOS = {
  coleccion: '<path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M6 4h12M8 11h8"/>',
  top: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>',
  izq: '<path d="M15 6l-6 6 6 6"/>',
  der: '<path d="M9 6l6 6-6 6"/>',
  rejilla: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  lista: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  regalo: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8S10 3 7.5 4.5 9 8 12 8zm0 0s2-5 4.5-3.5S15 8 12 8z"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  papelera: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  arriba: '<path d="M6 15l6-6 6 6"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  resumen: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="4" rx="1"/><rect x="13" y="10" width="7" height="10" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/>',
  capas: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  caja: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  mando: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M16 12h.01M18 14h.01"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  cambio: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  tienda: '<path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 13h6"/>',
  sonido: '<path d="M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  silencio: '<path d="M11 5L6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6"/>',
  polvo: '<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};

function icono(nombre, clase = '') {
  const span = document.createElement('span');
  span.className = 'ico ' + clase;
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre] || ''}</svg>`;
  return span;
}

// Emblema del reverso: carta con estrella
const EMBLEMA_SVG =
  '<svg class="emblema" viewBox="0 0 40 52" aria-hidden="true"><rect x="2" y="2" width="36" height="48" rx="5" fill="#6d4aff" stroke="#c4a5ff" stroke-width="2"/><rect x="7" y="7" width="26" height="20" rx="2" fill="#2e1d6b"/><path d="M20 10l1.8 5.2 5.2 1.8-5.2 1.8L20 24l-1.8-5.2L13 17l5.2-1.8z" fill="#ffd23f"/><rect x="8" y="32" width="18" height="2.5" rx="1" fill="#c4a5ff"/><rect x="8" y="37" width="12" height="2.5" rx="1" fill="#9b84e6"/><circle cx="31" cy="43" r="2" fill="#ffd23f"/></svg>';

function elementoReverso() {
  const el = crear('div', 'reverso');
  el.innerHTML = EMBLEMA_SVG;
  return el;
}

// ------------------------------------------------------------------
// Dibuja una carta completa.
// opciones: { serie, nueva, gris }
// ------------------------------------------------------------------
function elementoCarta(carta, opciones = {}) {
  const el = crear(
    'div',
    `carta r-${carta.rareza} diseno-${carta.diseno || 'clasica'} efecto-${carta.efecto || 'auto'}` +
      (carta.efecto_modo === 'mover' ? ' solo-mover' : '') + (opciones.gris ? ' gris' : ''),
  );
  const marco = crear('div', 'c-marco');

  const cab = crear('div', 'c-cab');
  cab.appendChild(crear('span', 'c-nombre', carta.nombre || 'Sin nombre'));
  cab.appendChild(crear('span', 'c-coste', String(carta.coste ?? 0)));
  marco.appendChild(cab);

  const arte = crear('div', 'c-arte');
  if (carta.imagen_url) {
    const img = document.createElement('img');
    img.src = carta.imagen_url;
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;
    img.addEventListener('error', () => img.remove());
    arte.appendChild(img);
  }
  if (opciones.nueva) arte.appendChild(crear('span', 'c-badge c-nueva', 'Nueva'));
  if (carta.limite_copias) arte.appendChild(crear('span', 'c-badge c-limitada', '🔒 Edición limitada'));
  arte.appendChild(crear('span', 'c-badge c-rareza', textoRareza(carta.rareza)));
  if (opciones.nota) arte.appendChild(crear('span', 'c-badge c-nota nota-' + opciones.nota, '★ ' + opciones.nota));
  marco.appendChild(arte);

  const caja = crear('div', 'c-texto');
  if (carta.descripcion) caja.appendChild(crear('p', 'c-desc', carta.descripcion));
  if (carta.frase) caja.appendChild(crear('p', 'c-frase', carta.frase));
  marco.appendChild(caja);

  const pie = crear('div', 'c-pie');
  const autor = crear('div');
  autor.appendChild(crear('small', null, 'ARTISTA'));
  autor.appendChild(crear('b', null, carta.artista || '—'));
  pie.appendChild(autor);
  const num = opciones.serie != null
    ? '#' + opciones.serie + (carta.limite_copias ? '/' + carta.limite_copias : '')
    : numero3(carta.id ?? 0);
  pie.appendChild(crear('span', 'c-num', num));
  marco.appendChild(pie);

  el.appendChild(marco);
  if (carta.efecto === 'galaxia') el.appendChild(capaGalaxia(carta.id || carta.nombre || 1));
  return el;
}

// Dibuja un sobre (portada propia o diseño por defecto)
function elementoPack(tipo) {
  const el = crear('div', 'pack efecto-' + (tipo?.efecto || 'brillo'));
  const brillo = crear('div', 'brillo');
  if (tipo?.imagen_url) {
    // El reflejo solo se dibuja sobre la parte visible de la portada
    // JSON.stringify escapa comillas y barras: la URL no puede "salirse" del url(...)
    for (const prop of ['maskImage', 'webkitMaskImage']) brillo.style[prop] = `url(${JSON.stringify(tipo.imagen_url)})`;
    for (const prop of ['maskSize', 'webkitMaskSize']) brillo.style[prop] = 'contain';
    for (const prop of ['maskRepeat', 'webkitMaskRepeat']) brillo.style[prop] = 'no-repeat';
    for (const prop of ['maskPosition', 'webkitMaskPosition']) brillo.style[prop] = 'center';
    el.classList.add('con-imagen');
    const img = document.createElement('img');
    img.src = tipo.imagen_url;
    img.alt = tipo.nombre || '';
    img.draggable = false;
    img.addEventListener('error', () => {
      img.remove();
      el.classList.remove('con-imagen');
    });
    el.appendChild(img);
  }
  el.appendChild(crear('div', 'diamante'));
  el.appendChild(crear('div', 'pack-nombre', tipo?.nombre || 'Sobre'));
  if (tipo?.efecto === 'galaxia') brillo.appendChild(capaGalaxia('sobre-' + (tipo.id || tipo.nombre || 1)));
  el.appendChild(brillo);
  return el;
}

// Aviso flotante
function avisar(texto, esError = false) {
  let el = document.getElementById('aviso');
  if (!el) {
    el = crear('div', 'aviso');
    el.id = 'aviso';
    document.body.appendChild(el);
  }
  el.textContent = texto;
  el.className = 'aviso' + (esError ? ' error' : '');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.add('oculto'), 3800);
}

// Modal sencillo. contenido: Node. Devuelve función para cerrar.
function abrirModal(contenido, contenedor = document.body) {
  const fondo = crear('div', 'modal-fondo');
  const caja = crear('div', 'modal');
  caja.appendChild(contenido);
  fondo.appendChild(caja);
  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', (e) => e.target === fondo && cerrar());
  contenedor.appendChild(fondo);
  return cerrar;
}

// Efecto 3D: la carta se inclina siguiendo el ratón y un reflejo holográfico
// se mueve por encima. Devuelve el mismo elemento.
function inclinable(carta) {
  const envoltura = crear('div', 'inclinable');
  const reflejo = crear('div', 'reflejo');
  carta.appendChild(reflejo);
  envoltura.appendChild(carta);
  envoltura.addEventListener('pointermove', (e) => {
    const r = envoltura.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    carta.style.transform = `perspective(700px) rotateY(${(x - 0.5) * 22}deg) rotateX(${(0.5 - y) * 22}deg) scale(1.03)`;
    carta.style.setProperty('--mx', x * 100 + '%');
    carta.style.setProperty('--my', y * 100 + '%');
    carta.classList.add('activa');
  });
  envoltura.addEventListener('pointerleave', () => {
    carta.style.transform = '';
    carta.classList.remove('activa');
  });
  return envoltura;
}


// ------------------------------------------------------------------
// Sonidos sintetizados (sin archivos de audio)
// ------------------------------------------------------------------
const Sonido = (() => {
  let ctx = null;
  let silencio = false;
  try { silencio = localStorage.getItem('cartas-silencio') === '1'; } catch { /* sin almacenamiento */ }

  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tono(frecuencia, inicio, duracion, forma = 'sine', volumen = 0.1, frecuenciaFinal) {
    const a = audio();
    const t = a.currentTime + inicio;
    const osc = a.createOscillator();
    const gan = a.createGain();
    osc.type = forma;
    osc.frequency.setValueAtTime(frecuencia, t);
    if (frecuenciaFinal) osc.frequency.exponentialRampToValueAtTime(frecuenciaFinal, t + duracion);
    gan.gain.setValueAtTime(0.0001, t);
    gan.gain.exponentialRampToValueAtTime(volumen, t + 0.01);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    osc.connect(gan).connect(a.destination);
    osc.start(t);
    osc.stop(t + duracion + 0.05);
  }

  function ruido(inicio, duracion, volumen, frecuencia) {
    const a = audio();
    const t = a.currentTime + inicio;
    const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * duracion), a.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
    const fuente = a.createBufferSource();
    fuente.buffer = buffer;
    const filtro = a.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = frecuencia;
    const gan = a.createGain();
    gan.gain.setValueAtTime(volumen, t);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    fuente.connect(filtro).connect(gan).connect(a.destination);
    fuente.start(t);
  }

  const NOTAS = { comun: [523], rara: [523, 659], epica: [523, 659, 784], legendaria: [523, 659, 784, 1047], divina: [523, 659, 784, 1047, 1319] };

  const efectos = {
    click: () => tono(880, 0, 0.06, 'triangle', 0.04),
    temblor: () => { for (let i = 0; i < 6; i++) ruido(i * 0.16, 0.12, 0.05, 500 + i * 80); },
    rasgar: () => { ruido(0, 0.4, 0.28, 2600); tono(320, 0, 0.35, 'sawtooth', 0.04, 70); },
    carta: () => tono(500, 0, 0.09, 'triangle', 0.05, 760),
    girar: () => ruido(0, 0.13, 0.12, 4200),
    redoble: () => { for (let i = 0; i < 10; i++) ruido(i * 0.095, 0.06, 0.06 + i * 0.008, 260); },
    revelar: (rareza) => {
      const notas = NOTAS[rareza] || NOTAS.comun;
      notas.forEach((f, i) => tono(f, i * 0.09, 0.55, 'triangle', 0.09));
      if (rareza === 'legendaria' || rareza === 'divina') {
        for (let i = 0; i < 8; i++) tono(1800 + Math.random() * 1600, 0.35 + i * 0.06, 0.25, 'sine', 0.025);
      }
    },
    polvo: () => [1200, 1500, 1900, 2400].forEach((f, i) => tono(f, i * 0.05, 0.25, 'sine', 0.04)),
    compra: () => { tono(988, 0, 0.12, 'square', 0.04); tono(1319, 0.1, 0.3, 'square', 0.04); },
  };

  return {
    play(nombre, ...args) {
      if (silencio) return;
      try { efectos[nombre]?.(...args); } catch { /* el navegador no permite audio */ }
    },
    get silencio() { return silencio; },
    alternar() {
      silencio = !silencio;
      try { localStorage.setItem('cartas-silencio', silencio ? '1' : '0'); } catch { /* sin almacenamiento */ }
      return silencio;
    },
  };
})();

// Nombres para los selectores del admin
const DISENOS = {
  clasica: { nombre: 'Clásica', desc: 'Ilustración arriba y texto abajo' },
  arte_completo: { nombre: 'Arte completo', desc: 'La ilustración ocupa toda la carta' },
  minimalista: { nombre: 'Minimalista', desc: 'Solo nombre e ilustración, sin texto' },
};
const EFECTOS = {
  auto: { nombre: 'Automático', desc: 'Según la rareza' },
  ninguno: { nombre: 'Ninguno', desc: 'Sin efecto' },
  brillo: { nombre: 'Brillo', desc: 'Un destello que recorre la carta' },
  arcoiris: { nombre: 'Holo arcoíris', desc: 'Reflejo de colores clásico' },
  galaxia: { nombre: 'Galaxia', desc: 'Estrellas que titilan' },
  dorado: { nombre: 'Dorado', desc: 'Lámina de oro brillante' },
  cristal: { nombre: 'Cristal', desc: 'Prisma que cambia de color' },
};

// ------------------------------------------------------------------
// Certificación
// ------------------------------------------------------------------
const NOTAS = {
  10: 'Perfecta', 9: 'Impecable', 8: 'Excelente', 7: 'Muy buena', 6: 'Buena',
  5: 'Correcta', 4: 'Usada', 3: 'Gastada', 2: 'Dañada', 1: 'Muy dañada',
};
function multiplicadorNota(nota) {
  if (!nota) return 1;
  return { 10: 10, 9: 5, 8: 3, 7: 2, 6: 1.5, 5: 1.2, 4: 1, 3: 0.5, 2: 0.25, 1: 0.1 }[nota] ?? 1;
}
function valorPolvo(carta, nota, tabla) {
  return Math.round((tabla?.[carta.rareza] ?? 0) * multiplicadorNota(nota));
}

// Carta dentro de su funda de certificación, con la etiqueta de la nota.
function elementoFunda(carta, opciones = {}) {
  const funda = crear('div', 'funda' + (opciones.nota ? ' nota-' + opciones.nota : ' pendiente'));
  const etiqueta = crear('div', 'funda-etiqueta');
  const izq = crear('div', 'funda-datos');
  izq.appendChild(crear('div', 'funda-marca', '✦ CERTIFICADA'));
  izq.appendChild(crear('div', 'funda-nombre', carta.nombre));
  izq.appendChild(crear('div', 'funda-serie', (opciones.serie != null ? '#' + opciones.serie + (carta.limite_copias ? '/' + carta.limite_copias : '') + ' · ' : '') + textoRareza(carta.rareza)));
  const der = crear('div', 'funda-nota');
  if (opciones.nota) {
    der.appendChild(crear('b', null, String(opciones.nota)));
    der.appendChild(crear('span', null, NOTAS[opciones.nota]));
  } else {
    der.appendChild(crear('b', null, '?'));
    der.appendChild(crear('span', null, 'En revisión'));
  }
  etiqueta.append(izq, der);
  const ventana = crear('div', 'funda-ventana');
  ventana.appendChild(elementoCarta(carta, { serie: opciones.serie }));
  funda.append(etiqueta, ventana);
  return funda;
}


// ------------------------------------------------------------------
// Efecto galaxia: cielo estrellado generado al azar pero siempre igual
// para la misma carta (la "semilla" es su id). Se dibuja con SVG.
// ------------------------------------------------------------------
function aleatorioConSemilla(semilla) {
  let h = 2166136261;
  for (const ch of String(semilla)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function capaGalaxia(semilla) {
  const azar = aleatorioConSemilla(semilla);
  const capa = crear('div', 'c-galaxia');

  // Nebulosas de colores en posiciones distintas para cada carta
  const tonos = ['168, 85, 247', '236, 72, 153', '59, 130, 246', '45, 212, 191', '250, 204, 21'];
  const nebulosa = crear('div', 'nebulosa');
  const manchas = [];
  for (let i = 0; i < 3; i++) {
    const color = tonos[Math.floor(azar() * tonos.length)];
    manchas.push(`radial-gradient(ellipse ${30 + azar() * 25}% ${22 + azar() * 20}% at ${15 + azar() * 70}% ${15 + azar() * 70}%, rgba(${color}, ${0.35 + azar() * 0.3}), transparent 70%)`);
  }
  nebulosa.style.background = manchas.join(',');
  capa.appendChild(nebulosa);

  const colores = ['#ffffff', '#ffffff', '#dbeafe', '#fef3c7', '#fbcfe8'];
  const crearCielo = (clase, cantidad, radioMin, radioMax, titilan) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 140');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.setAttribute('class', clase);
    for (let i = 0; i < cantidad; i++) {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', (azar() * 100).toFixed(2));
      c.setAttribute('cy', (azar() * 140).toFixed(2));
      c.setAttribute('r', (radioMin + Math.pow(azar(), 2.2) * (radioMax - radioMin)).toFixed(2));
      c.setAttribute('fill', colores[Math.floor(azar() * colores.length)]);
      c.setAttribute('opacity', (0.35 + azar() * 0.65).toFixed(2));
      if (azar() < titilan) {
        c.setAttribute('class', 'titila');
        c.style.setProperty('--d', (1.8 + azar() * 2.8).toFixed(2) + 's');
        c.style.setProperty('--r', (-azar() * 4).toFixed(2) + 's');
      }
      svg.appendChild(c);
    }
    return svg;
  };
  capa.appendChild(crearCielo('lejos', 55, 0.15, 0.45, 0.25));
  const cerca = crearCielo('cerca', 16, 0.35, 0.9, 0.5);

  // Algunas estrellas grandes de 4 puntas que destellan
  for (let i = 0; i < 3; i++) {
    const x = 8 + azar() * 84;
    const y = 8 + azar() * 124;
    const t = 1.6 + azar() * 1.6;
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', `M${x} ${y - t}L${x + t * 0.22} ${y - t * 0.22}L${x + t} ${y}L${x + t * 0.22} ${y + t * 0.22}L${x} ${y + t}L${x - t * 0.22} ${y + t * 0.22}L${x - t} ${y}L${x - t * 0.22} ${y - t * 0.22}Z`);
    p.setAttribute('fill', '#ffffff');
    p.setAttribute('class', 'destello');
    p.style.setProperty('--d', (2.6 + azar() * 2.4).toFixed(2) + 's');
    p.style.setProperty('--r', (-azar() * 4).toFixed(2) + 's');
    cerca.appendChild(p);
  }
  capa.appendChild(cerca);

  // Estrellas fugaces de vez en cuando
  for (let i = 0; i < 2; i++) {
    const f = crear('div', 'fugaz');
    f.style.left = 55 + azar() * 45 + '%';
    f.style.top = azar() * 45 + '%';
    f.style.setProperty('--d', (7 + azar() * 6).toFixed(1) + 's');
    f.style.setProperty('--r', (azar() * 8).toFixed(1) + 's');
    capa.appendChild(f);
  }
  return capa;
}
