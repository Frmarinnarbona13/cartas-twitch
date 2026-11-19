// =====================================================================
// Panel de admin: resumen, cartas, sobres, simulador, drops y ajustes.
// Solo funciona para el propietario del canal (rol broadcaster).
// =====================================================================
const $ = (id) => document.getElementById(id);
const datos = { cartas: [], tipos: [], ajustes: null, resumen: null };
const vista = { seccion: 'resumen', filtroRareza: 'todas', busqueda: '', gruposCerrados: new Set() };

// ------------------------------------------------------------------
// Arranque
// ------------------------------------------------------------------
document.querySelectorAll('#menu button').forEach((b) => b.prepend(icono(b.dataset.ico)));
$('cajon-cerrar').appendChild(icono('cerrar'));

Twitch.ext.onAuthorized(async (auth) => {
  tokenTwitch = auth.token;
  if (auth.role && auth.role !== 'broadcaster') {
    estadoCarga('Este panel solo está disponible para el propietario del canal.', true);
    return;
  }
  try {
    await Promise.all([cargarCartas(), cargarTipos(), cargarAjustes(), cargarResumen()]);
    $('estado-carga').classList.add('oculto');
  } catch (e) {
    estadoCarga('No se pudo conectar con el servidor: ' + e.message, true);
  }
});

function estadoCarga(texto, error) {
  const el = $('estado-carga');
  el.textContent = texto;
  el.classList.toggle('error', Boolean(error));
  el.classList.remove('oculto');
}

$('menu').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) irA(b.dataset.sec);
});

function irA(seccion) {
  vista.seccion = seccion;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('activo', b.dataset.sec === seccion));
  document.querySelectorAll('.seccion').forEach((s) => s.classList.toggle('activa', s.id === 's-' + seccion));
  if (seccion === 'resumen') cargarResumen().catch(() => {});
  if (seccion === 'espectadores') cargarEspectadores();
  window.scrollTo({ top: 0 });
}

// Segmentados genéricos: devuelven el valor activo
function segmentado(id, alCambiar) {
  const el = $(id);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    alCambiar?.(b.dataset.v);
  });
  return () => el.querySelector('button.activo')?.dataset.v;
}

function opcion(valor, texto, desactivada) {
  const o = document.createElement('option');
  o.value = valor;
  o.textContent = texto;
  o.disabled = Boolean(desactivada);
  return o;
}

function campo(etiqueta, control, ayuda) {
  const c = crear('div', 'campo');
  if (etiqueta) c.appendChild(crear('label', null, etiqueta));
  c.appendChild(control);
  if (ayuda) c.appendChild(crear('div', 'ayuda', ayuda));
  return c;
}

function entrada(tipo, valor, attrs = {}) {
  const el = document.createElement(tipo === 'textarea' ? 'textarea' : 'input');
  if (tipo !== 'textarea') el.type = tipo;
  el.className = 'input';
  el.value = valor ?? '';
  Object.assign(el, attrs);
  return el;
}

function interruptor(texto, marcado) {
  const l = crear('label', 'interruptor');
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = Boolean(marcado);
  l.append(i, texto);
  return { el: l, input: i };
}

function hace(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return fechaCorta(iso);
}

// ------------------------------------------------------------------
// Cajón lateral (editor)
// ------------------------------------------------------------------
const cajon = {
  abrir({ titulo, sub }) {
    $('cajon-titulo').textContent = titulo;
    $('cajon-sub').textContent = sub || '';
    $('cajon-cuerpo').innerHTML = '';
    $('cajon-pie').innerHTML = '';
    $('cajon-preview').innerHTML = '';
    $('cajon').classList.remove('oculto');
  },
  cerrar() {
    $('cajon').classList.add('oculto');
  },
};
$('cajon-cerrar').addEventListener('click', cajon.cerrar);
$('cajon').addEventListener('click', (e) => e.target === $('cajon') && cajon.cerrar());
document.addEventListener('keydown', (e) => e.key === 'Escape' && cajon.cerrar());

// =====================================================================
// RESUMEN
// =====================================================================
async function cargarResumen() {
  datos.resumen = await api('/api/admin/resumen');
  pintarResumen();
}
$('btn-refrescar').addEventListener('click', () => cargarResumen().then(() => avisar('Actualizado')));

function pintarResumen() {
  const r = datos.resumen;
  const tiles = [
    [r.activos_ahora, 'Conectados ahora', true],
    [r.usuarios, 'Coleccionistas'],
    [r.copias, 'Cartas repartidas'],
    [r.sobres_semana, 'Sobres esta semana'],
    [r.sobres_sin_abrir, 'Sobres sin abrir'],
    [`${r.cartas_activas}/${r.cartas}`, 'Cartas activas'],
    [r.agotadas, 'Ediciones agotadas'],
  ];
  const caja = $('tiles');
  caja.innerHTML = '';
  for (const [valor, texto, destacado] of tiles) {
    const t = crear('div', 'tile' + (destacado ? ' destacado' : ''));
    t.append(crear('b', null, String(valor)), crear('span', null, texto));
    caja.appendChild(t);
  }

  const top = $('resumen-top');
  top.innerHTML = '';
  if (!r.top.length) top.appendChild(crear('p', 'sub', 'Nadie ha abierto sobres esta semana todavía.'));
  for (const f of r.top) {
    const it = crear('div', 'item-lista');
    it.append(crear('span', 'pos', String(f.posicion)), crear('span', 'grow', f.nombre), crear('span', 'der', `${f.sobres} sobres`));
    top.appendChild(it);
  }

  const ult = $('resumen-ultimas');
  ult.innerHTML = '';
  if (!r.ultimas.length) ult.appendChild(crear('p', 'sub', 'Aún no se ha conseguido ninguna carta.'));
  for (const u of r.ultimas) {
    const it = crear('div', 'item-lista r-' + u.rareza);
    const quien = crear('span', 'grow');
    quien.append(crear('span', 'punto'), ' ');
    quien.appendChild(crear('b', null, u.usuario));
    quien.append(u.origen === 'drop_carta' ? ' recibió ' : ' consiguió ');
    quien.appendChild(crear('b', null, u.carta));
    if (u.limite) quien.append(` #${u.serie}/${u.limite}`);
    it.append(quien, crear('span', 'der', hace(u.fecha)));
    ult.appendChild(it);
  }
}

// =====================================================================
// MIS CARTAS
// =====================================================================
async function cargarCartas() {
  datos.cartas = (await api('/api/admin/cartas')).cartas;
  pintarCartas();
  pintarSelectsRegalo();
}

$('buscar-carta').addEventListener('input', (e) => {
  vista.busqueda = e.target.value.trim().toLowerCase();
  pintarCartas();
});
$('btn-nueva-carta').addEventListener('click', () => editarCarta(null));

function gruposExistentes() {
  return [...new Set(datos.cartas.map((c) => c.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function pintarCartas() {
  const cartas = datos.cartas;
  const emitidas = cartas.reduce((s, c) => s + c.copias_emitidas, 0);

  const resumen = $('cartas-resumen');
  resumen.innerHTML = '';
  resumen.append(icono('capas'), `${cartas.length} cartas · ${cartas.filter((c) => c.activa).length} activas · ${emitidas} copias repartidas`);

  // Filtro por rareza
  const chips = $('filtro-rareza');
  chips.innerHTML = '';
  const opcionesFiltro = [['todas', 'Todas', cartas.length], ...Object.entries(RAREZAS).map(([k, v]) => [k, v.nombre, cartas.filter((c) => c.rareza === k).length])];
  for (const [clave, nombre, n] of opcionesFiltro) {
    const chip = crear('button', 'chip r-' + clave + (vista.filtroRareza === clave ? ' activo' : ''));
    if (clave !== 'todas') chip.appendChild(crear('span', 'punto'));
    chip.append(`${nombre} (${n})`);
    chip.addEventListener('click', () => {
      vista.filtroRareza = clave;
      pintarCartas();
    });
    chips.appendChild(chip);
  }

  // Filtrar
  const visibles = cartas.filter(
    (c) =>
      (vista.filtroRareza === 'todas' || c.rareza === vista.filtroRareza) &&
      (!vista.busqueda || c.nombre.toLowerCase().includes(vista.busqueda) || (c.grupo || '').toLowerCase().includes(vista.busqueda)),
  );

  const zona = $('grupos-cartas');
  zona.innerHTML = '';
  if (cartas.length === 0) {
    const v = crear('div', 'vacio-admin');
    v.appendChild(crear('p', null, 'Todavía no tienes cartas.'));
    const b = crear('button', 'btn primario', '+ Crear la primera');
    b.addEventListener('click', () => editarCarta(null));
    v.appendChild(b);
    zona.appendChild(v);
    return;
  }
  if (visibles.length === 0) {
    zona.appendChild(crear('div', 'vacio-admin', 'Ninguna carta coincide con el filtro.'));
    return;
  }

  // Agrupar por grupo
  const porGrupo = new Map();
  for (const c of visibles) {
    const g = c.grupo || '';
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(c);
  }
  const nombres = [...porGrupo.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

  for (const g of nombres) {
    const bloque = crear('div', 'grupo-cartas' + (vista.gruposCerrados.has(g) ? ' cerrado' : ''));
    const cab = crear('div', 'grupo-cab');
    cab.append(icono('abajo'), icono('capas'), g || 'Sin grupo', crear('span', 'n', `· ${porGrupo.get(g).length} cartas`));
    cab.addEventListener('click', () => {
      vista.gruposCerrados.has(g) ? vista.gruposCerrados.delete(g) : vista.gruposCerrados.add(g);
      bloque.classList.toggle('cerrado');
    });
    const rejilla = crear('div', 'rejilla-admin');
    for (const c of porGrupo.get(g)) rejilla.appendChild(fichaCarta(c));
    bloque.append(cab, rejilla);
    zona.appendChild(bloque);
  }
}

function fichaCarta(c) {
  const f = crear('div', 'ficha r-' + c.rareza + (c.activa ? '' : ' inactiva'));
  f.appendChild(elementoCarta(c));
  const nombre = crear('div', 'nombre');
  nombre.append(crear('span', 'punto'), c.nombre);
  const meta = crear('div', 'meta');
  meta.append(numero3(c.id), crear('span', 'tag', textoRareza(c.rareza)));
  if (!c.activa) meta.appendChild(crear('span', 'tag', 'Desactivada'));
  const stock = crear('div', 'stock');
  if (c.limite_copias) {
    stock.append(`${c.copias_emitidas} / ${c.limite_copias} emitidas`);
    if (c.copias_emitidas >= c.limite_copias) stock.append(' · ', crear('span', 'agotada', 'AGOTADA'));
    const barra = crear('div', 'barra');
    const relleno = crear('div');
    relleno.style.width = Math.min(100, (c.copias_emitidas / c.limite_copias) * 100) + '%';
    barra.appendChild(relleno);
    stock.appendChild(barra);
  } else {
    stock.append(`${c.copias_emitidas} emitidas · sin límite`);
  }
  f.append(nombre, meta, stock);
  f.addEventListener('click', () => editarCarta(c));
  return f;
}

function editarCarta(carta) {
  const nueva = !carta;
  const c = carta ? { ...carta } : { nombre: '', coste: 0, rareza: 'comun', imagen_url: '', descripcion: '', frase: '', artista: '', grupo: '', limite_copias: null, activa: true, diseno: 'clasica', efecto: 'auto', copias_emitidas: 0 };
  cajon.abrir({
    titulo: nueva ? 'Nueva carta' : 'Editar carta',
    sub: nueva ? 'Rellena los datos; la vista previa se actualiza sola.' : `${numero3(c.id)} · ${c.copias_emitidas} copias emitidas`,
  });

  const preview = () => {
    const zona = $('cajon-preview');
    zona.innerHTML = '';
    zona.appendChild(inclinable(elementoCarta({ ...c, id: c.id ?? datos.cartas.length + 1 }, { nueva: false })));
    zona.appendChild(crear('div', 'antetitulo', 'Vista previa · pasa el ratón por encima'));
    zona.appendChild(tablaAparicion(c));
    pintarMiniDisenos();
  };

  const cuerpo = $('cajon-cuerpo');
  const nombre = entrada('text', c.nombre, { maxLength: 40, placeholder: 'Ej: Dragón Celestial' });
  const coste = entrada('number', c.coste, { min: 0, max: 99 });
  const imagen = entrada('url', c.imagen_url, { placeholder: 'https://tuusuario.github.io/cartas/dragon.png' });
  const desc = entrada('textarea', c.descripcion, { maxLength: 160, rows: 2, placeholder: 'Efecto o texto principal (negrita)' });
  const frase = entrada('textarea', c.frase, { maxLength: 120, rows: 2, placeholder: 'Frase en cursiva (opcional)' });
  const artista = entrada('text', c.artista, { maxLength: 40, placeholder: 'Quién la dibujó' });
  const grupo = entrada('text', c.grupo, { maxLength: 40, placeholder: 'Ej: Base, Navidad 2026…' });
  const lista = document.createElement('datalist');
  lista.id = 'lista-grupos';
  gruposExistentes().forEach((g) => lista.appendChild(opcion(g, g)));
  grupo.setAttribute('list', 'lista-grupos');

  const rarezas = crear('div', 'rarezas-sel');
  for (const [k, v] of Object.entries(RAREZAS)) {
    const b = crear('button', 'r-' + k + (c.rareza === k ? ' activo' : ''));
    b.type = 'button';
    b.append(crear('span', 'punto'), v.nombre);
    b.addEventListener('click', () => {
      c.rareza = k;
      rarezas.querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
      preview();
    });
    rarezas.appendChild(b);
  }

  // Diseño: tres mini cartas para elegir
  const disenos = crear('div', 'disenos-sel');
  const pintarMiniDisenos = () => {
    disenos.innerHTML = '';
    for (const [k, info] of Object.entries(DISENOS)) {
      const b = crear('button', 'diseno-op' + (c.diseno === k ? ' activo' : ''));
      b.type = 'button';
      b.title = info.desc;
      b.appendChild(elementoCarta({ ...c, id: c.id ?? 0, diseno: k, efecto: 'ninguno' }));
      b.appendChild(crear('span', null, info.nombre));
      b.addEventListener('click', () => {
        c.diseno = k;
        preview();
      });
      disenos.appendChild(b);
    }
  };

  // Efecto holográfico
  const efectos = crear('div', 'efectos-sel');
  for (const [k, info] of Object.entries(EFECTOS)) {
    const b = crear('button', 'efecto-op ef-' + k + (c.efecto === k ? ' activo' : ''));
    b.type = 'button';
    b.title = info.desc;
    b.append(crear('span', 'muestra'), crear('b', null, info.nombre), crear('small', null, info.desc));
    b.addEventListener('click', () => {
      c.efecto = k;
      efectos.querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
      preview();
    });
    efectos.appendChild(b);
  }

  const limitada = interruptor('Edición limitada', c.limite_copias != null);
  const limite = entrada('number', c.limite_copias ?? 100, { min: Math.max(1, c.copias_emitidas || 1) });
  const campoLimite = campo('Número de copias', limite, c.copias_emitidas ? `Ya hay ${c.copias_emitidas} emitidas: no puede ser menor.` : 'Cuando se repartan todas, deja de salir en los sobres.');
  campoLimite.classList.toggle('oculto', !limitada.input.checked);
  const activa = interruptor('Activa (puede salir en sobres)', c.activa);

  const fila1 = crear('div', 'fila');
  fila1.append(campo('Nombre', nombre), campo('Coste', coste));
  fila1.lastChild.style.maxWidth = '110px';

  cuerpo.append(
    fila1,
    campo('Rareza', rarezas),
    campo('Diseño', disenos),
    campo('Efecto holográfico', efectos, '«Automático» pone brillo a las legendarias y holo a las divinas.'),
    campo('URL de la imagen', imagen, 'Sube la imagen a GitHub Pages (o similar) y pega aquí el enlace. Formato horizontal 5:4.'),
    campo('Texto / efecto', desc),
    campo('Frase', frase),
    campo('Artista', artista),
    campo('Grupo', grupo, 'Sirve para organizar y para hacer sobres con solo ciertas cartas.'),
    lista,
    campo(null, limitada.el),
    campoLimite,
    campo(null, activa.el),
  );

  const leer = () => {
    c.nombre = nombre.value;
    c.coste = Number(coste.value || 0);
    c.imagen_url = imagen.value.trim();
    c.descripcion = desc.value;
    c.frase = frase.value;
    c.artista = artista.value;
    c.grupo = grupo.value;
    c.limite_copias = limitada.input.checked ? Number(limite.value || 0) : null;
    c.activa = activa.input.checked;
    campoLimite.classList.toggle('oculto', !limitada.input.checked);
    preview();
  };
  cuerpo.addEventListener('input', leer);
  cuerpo.addEventListener('change', leer);
  preview();

  // Pie
  const pie = $('cajon-pie');
  if (!nueva) {
    const borrar = crear('button', 'btn peligro', 'Eliminar');
    if (c.copias_emitidas > 0) {
      borrar.disabled = true;
      borrar.title = 'Ya hay copias en colecciones: desactívala en su lugar';
    }
    borrar.addEventListener('click', async () => {
      if (!confirmar(borrar)) return;
      try {
        await api('/api/admin/cartas', { method: 'DELETE', body: { id: c.id } });
        avisar('Carta eliminada');
        cajon.cerrar();
        await cargarCartas();
      } catch (e) {
        avisar(e.message, true);
      }
    });
    pie.appendChild(borrar);
  }
  pie.appendChild(crear('div', 'espacio'));
  const cancelar = crear('button', 'btn', 'Cancelar');
  cancelar.addEventListener('click', cajon.cerrar);
  const guardar = crear('button', 'btn primario', nueva ? 'Crear carta' : 'Guardar cambios');
  guardar.addEventListener('click', async () => {
    leer();
    guardar.disabled = true;
    try {
      const body = {
        nombre: c.nombre, coste: c.coste, rareza: c.rareza, imagen_url: c.imagen_url, descripcion: c.descripcion,
        frase: c.frase, artista: c.artista, grupo: c.grupo, limite_copias: c.limite_copias, activa: c.activa,
        diseno: c.diseno, efecto: c.efecto,
      };
      if (nueva) await api('/api/admin/cartas', { method: 'POST', body });
      else await api('/api/admin/cartas', { method: 'PUT', body: { id: c.id, ...body } });
      avisar(nueva ? `Carta «${c.nombre}» creada` : 'Cambios guardados');
      cajon.cerrar();
      await Promise.all([cargarCartas(), cargarTipos()]);
    } catch (e) {
      avisar(e.message, true);
    } finally {
      guardar.disabled = false;
    }
  });
  pie.append(cancelar, guardar);
}

// Confirmación en dos clics (sin diálogos del navegador, que Twitch bloquea)
function confirmar(boton) {
  if (boton.dataset.confirmando) return true;
  boton.dataset.confirmando = '1';
  const original = boton.textContent;
  boton.textContent = '¿Seguro? Pulsa otra vez';
  setTimeout(() => {
    delete boton.dataset.confirmando;
    boton.textContent = original;
  }, 3000);
  return false;
}

// =====================================================================
// SOBRES
// =====================================================================
async function cargarTipos() {
  datos.tipos = (await api('/api/admin/tipos-sobre')).tipos;
  pintarTipos();
  pintarSelectsRegalo();
  pintarSelectSimulador();
}
$('btn-nuevo-sobre').addEventListener('click', () => editarTipo(null));

function barraProbabilidad(reales) {
  const caja = crear('div', 'prob-caja');
  caja.appendChild(crear('div', 'prob-titulo', 'Probabilidades de drop'));
  const barra = crear('div', 'prob-barra');
  const leyenda = crear('div', 'prob-leyenda');
  for (const r of Object.keys(RAREZAS)) {
    const pct = reales[r] || 0;
    if (pct <= 0) continue;
    const seg = crear('div', r);
    seg.style.width = pct + '%';
    seg.title = `${textoRareza(r)}: ${pct.toFixed(1)}%`;
    barra.appendChild(seg);
    const l = crear('span', 'r-' + r);
    l.append(crear('span', 'punto'), `${textoRareza(r)} ${pct.toFixed(pct < 10 ? 1 : 0)}%`);
    leyenda.appendChild(l);
  }
  caja.append(barra, leyenda);
  return caja;
}

function avisoSinCartas(sinCartas) {
  if (!sinCartas?.length) return null;
  return crear('div', 'aviso-sobre', `Este sobre no tiene cartas de: ${sinCartas.map(textoRareza).join(', ')}. Su porcentaje se reparte entre las demás rarezas.`);
}

function pintarTipos() {
  const lista = $('lista-sobres');
  lista.innerHTML = '';
  if (!datos.tipos.length) {
    lista.appendChild(crear('div', 'vacio-admin', 'No hay sobres. Crea el primero.'));
    return;
  }
  datos.tipos.forEach((t, i) => {
    const fila = crear('div', 'sobre-fila' + (t.modo === 'regalo' ? ' regalo' : '') + (t.activo ? '' : ' inactivo'));
    fila.appendChild(elementoPack(t));

    const centro = crear('div');
    centro.appendChild(crear('h3', null, t.nombre));
    const meta = crear('div', 'meta');
    const enPool = Object.values(t.pool || {}).reduce((s, n) => s + n, 0);
    meta.append(
      crear('span', 'badge ' + (t.modo === 'energia' ? 'verde' : 'rosa'), t.modo === 'energia' ? 'Gratis con energía' : 'Solo regalos y drops'),
      `${t.cartas_por_sobre} cartas boca abajo · ${enPool} cartas posibles`,
    );
    if (t.grupos?.length) meta.append(' · Grupos: ' + t.grupos.join(', '));
    if (t.precio_polvo) meta.appendChild(crear('span', 'badge gris', `Tienda: ✦ ${t.precio_polvo}`));
    if (!t.activo) meta.appendChild(crear('span', 'badge gris', 'Desactivado'));
    centro.appendChild(meta);
    centro.appendChild(barraProbabilidad(t.reales));
    const aviso = enPool === 0 ? crear('div', 'aviso-sobre', 'Este sobre no tiene ninguna carta disponible: no se podrá abrir.') : avisoSinCartas(t.sinCartas);
    if (aviso) centro.appendChild(aviso);
    fila.appendChild(centro);

    const acciones = crear('div', 'acciones-fila');
    const boton = (ico, titulo, fn, desactivado) => {
      const b = crear('button', 'btn');
      b.title = titulo;
      b.disabled = Boolean(desactivado);
      b.appendChild(icono(ico));
      b.addEventListener('click', fn);
      acciones.appendChild(b);
      return b;
    };
    boton('arriba', 'Subir', () => moverTipo(i, -1), i === 0);
    boton('abajo', 'Bajar', () => moverTipo(i, 1), i === datos.tipos.length - 1);
    boton('lapiz', 'Editar', () => editarTipo(t));
    const papelera = boton('papelera', 'Eliminar', async () => {
      if (!papelera.dataset.confirmando) {
        papelera.dataset.confirmando = '1';
        papelera.style.color = 'var(--rojo)';
        avisar('Pulsa otra vez la papelera para eliminar');
        setTimeout(() => { delete papelera.dataset.confirmando; papelera.style.color = ''; }, 3000);
        return;
      }
      try {
        await api('/api/admin/tipos-sobre', { method: 'DELETE', body: { id: t.id } });
        avisar('Sobre eliminado');
        await cargarTipos();
      } catch (e) {
        avisar(e.message, true);
      }
    });
    fila.appendChild(acciones);
    lista.appendChild(fila);
  });
}

async function moverTipo(i, delta) {
  const lista = [...datos.tipos];
  const [t] = lista.splice(i, 1);
  lista.splice(i + delta, 0, t);
  try {
    await Promise.all(lista.map((x, orden) => (x.orden === orden ? null : api('/api/admin/tipos-sobre', { method: 'PUT', body: { id: x.id, orden } }))));
    await cargarTipos();
  } catch (e) {
    avisar(e.message, true);
  }
}

// ¿Puede salir esta carta en un sobre con estos grupos?
function puedeSalir(carta, grupos) {
  return carta.activa && (carta.limite_copias == null || (carta.copias_emitidas || 0) < carta.limite_copias) &&
    (!grupos?.length || grupos.includes(carta.grupo || null));
}

// Calcula los % reales en el navegador (para la vista previa del editor)
function realesLocales(probabilidades, grupos, pool = datos.cartas.filter((c) => puedeSalir(c, grupos))) {
  const conCartas = new Set(pool.map((c) => c.rareza));
  const validas = Object.keys(RAREZAS).filter((r) => conCartas.has(r) && Number(probabilidades[r]) > 0);
  const total = validas.reduce((s, r) => s + Number(probabilidades[r]), 0);
  const reales = {};
  for (const r of Object.keys(RAREZAS)) reales[r] = validas.includes(r) && total ? (Number(probabilidades[r]) / total) * 100 : 0;
  const sinCartas = Object.keys(RAREZAS).filter((r) => Number(probabilidades[r]) > 0 && !conCartas.has(r));
  return { reales, sinCartas, total: pool.length };
}

function editarTipo(tipo) {
  const nuevo = !tipo;
  const t = tipo
    ? { ...tipo, probabilidades: { ...tipo.probabilidades }, grupos: [...(tipo.grupos || [])] }
    : { nombre: '', imagen_url: '', modo: 'energia', cartas_por_sobre: 5, grupos: [], activo: true, probabilidades: { comun: 60, rara: 25, epica: 10, legendaria: 4, divina: 1 } };

  cajon.abrir({ titulo: nuevo ? 'Nuevo sobre' : 'Editar sobre', sub: nuevo ? '' : t.nombre });
  const cuerpo = $('cajon-cuerpo');

  const preview = () => {
    const zona = $('cajon-preview');
    zona.innerHTML = '';
    zona.appendChild(elementoPack(t));
    const calc = realesLocales(t.probabilidades, t.grupos);
    zona.appendChild(barraProbabilidad(calc.reales));
    const aviso = calc.total === 0 ? crear('div', 'aviso-sobre', 'Ninguna carta activa encaja con este sobre.') : avisoSinCartas(calc.sinCartas);
    if (aviso) zona.appendChild(aviso);
    zona.appendChild(crear('div', 'antetitulo', `${calc.total} cartas pueden salir`));
    for (const [r, el] of Object.entries(realesTexto)) el.textContent = calc.reales[r].toFixed(1) + '%';
  };

  const nombre = entrada('text', t.nombre, { maxLength: 40, placeholder: 'Ej: Sobre Normal' });
  const imagen = entrada('url', t.imagen_url, { placeholder: 'https://… (opcional)' });
  const num = entrada('number', t.cartas_por_sobre, { min: 1, max: 10 });
  const precio = entrada('number', t.precio_polvo ?? '', { min: 1, placeholder: 'No se vende' });

  const modo = crear('div', 'segmentado');
  for (const [v, txt] of [['energia', 'Gratis con energía'], ['regalo', 'Solo regalos y drops']]) {
    const b = crear('button', v === t.modo ? 'activo' : '', txt);
    b.type = 'button';
    b.addEventListener('click', () => {
      t.modo = v;
      modo.querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    });
    modo.appendChild(b);
  }

  const grupos = crear('div', 'grupos-sel');
  const existentes = gruposExistentes();
  if (!existentes.length) grupos.appendChild(crear('div', 'ayuda', 'Todavía no hay grupos: el sobre incluye todas las cartas.'));
  for (const g of existentes) {
    const l = crear('label');
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = t.grupos.includes(g);
    i.addEventListener('change', () => {
      t.grupos = i.checked ? [...t.grupos, g] : t.grupos.filter((x) => x !== g);
      preview();
    });
    l.append(i, g);
    grupos.appendChild(l);
  }

  const probs = crear('div');
  const realesTexto = {};
  for (const [r, info] of Object.entries(RAREZAS)) {
    const fila = crear('div', 'prob-fila r-' + r);
    const etiqueta = crear('span');
    etiqueta.append(crear('span', 'punto'), ' ' + info.nombre);
    const rango = entrada('range', t.probabilidades[r] ?? 0, { min: 0, max: 100, step: 0.5 });
    rango.className = '';
    const numero = entrada('number', t.probabilidades[r] ?? 0, { min: 0, max: 100, step: 0.1 });
    realesTexto[r] = crear('span', 'real');
    const actualizar = (v) => {
      t.probabilidades[r] = Number(v || 0);
      rango.value = t.probabilidades[r];
      numero.value = t.probabilidades[r];
      preview();
    };
    rango.addEventListener('input', () => actualizar(rango.value));
    numero.addEventListener('input', () => actualizar(numero.value));
    fila.append(etiqueta, rango, numero, realesTexto[r]);
    probs.appendChild(fila);
  }

  const activo = interruptor('Activo', t.activo);

  if (!t.efecto) t.efecto = 'brillo';
  const efectosSobre = crear('div', 'efectos-sel');
  for (const [k, info] of Object.entries(EFECTOS)) {
    if (k === 'auto') continue;
    const b = crear('button', 'efecto-op ef-' + k + (t.efecto === k ? ' activo' : ''));
    b.type = 'button';
    b.append(crear('span', 'muestra'), crear('b', null, info.nombre), crear('small', null, info.desc));
    b.addEventListener('click', () => {
      t.efecto = k;
      efectosSobre.querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
      preview();
    });
    efectosSobre.appendChild(b);
  }

  cuerpo.append(
    campo('Nombre', nombre),
    campo('Efecto holográfico', efectosSobre),
    campo('Portada', imagen, 'Opcional. Imagen vertical (3:4). Si no pones nada se usa el diseño por defecto.'),
    campo('¿Cómo se consigue?', modo, '«Gratis con energía» aparece en Packs para todos. «Solo regalos» solo llega con tus drops.'),
    campo('Cartas boca abajo para elegir', num),
    campo('Precio en la tienda (polvo)', precio, 'Vacío = no se vende en la tienda.'),
    campo('Qué cartas contiene', grupos, 'Marca grupos para limitar el sobre. Sin marcar = todas las cartas.'),
    campo('Probabilidad por rareza (pesos)', probs, 'La columna gris es el % real teniendo en cuenta las cartas disponibles.'),
    campo(null, activo.el),
  );

  const leerBasicos = () => {
    t.nombre = nombre.value;
    t.imagen_url = imagen.value.trim();
    t.cartas_por_sobre = Number(num.value || 5);
    t.precio_polvo = precio.value === '' ? null : Number(precio.value);
    t.activo = activo.input.checked;
    preview();
  };
  [nombre, imagen, num, precio].forEach((el) => el.addEventListener('input', leerBasicos));
  activo.input.addEventListener('change', leerBasicos);
  preview();

  const pie = $('cajon-pie');
  pie.appendChild(crear('div', 'espacio'));
  const cancelar = crear('button', 'btn', 'Cancelar');
  cancelar.addEventListener('click', cajon.cerrar);
  const guardar = crear('button', 'btn primario', nuevo ? 'Crear sobre' : 'Guardar cambios');
  guardar.addEventListener('click', async () => {
    leerBasicos();
    guardar.disabled = true;
    try {
      const body = { nombre: t.nombre, imagen_url: t.imagen_url, modo: t.modo, cartas_por_sobre: t.cartas_por_sobre, grupos: t.grupos, probabilidades: t.probabilidades, activo: t.activo, precio_polvo: t.precio_polvo, efecto: t.efecto };
      if (nuevo) await api('/api/admin/tipos-sobre', { method: 'POST', body: { ...body, orden: datos.tipos.length } });
      else await api('/api/admin/tipos-sobre', { method: 'PUT', body: { id: t.id, ...body } });
      avisar('Sobre guardado');
      cajon.cerrar();
      await cargarTipos();
    } catch (e) {
      avisar(e.message, true);
    } finally {
      guardar.disabled = false;
    }
  });
  pie.append(cancelar, guardar);
}

// =====================================================================
// SIMULADOR
// =====================================================================
function pintarSelectSimulador() {
  const sel = $('sim-tipo');
  const actual = sel.value;
  sel.innerHTML = '';
  datos.tipos.forEach((t) => sel.appendChild(opcion(t.id, t.nombre + (t.activo ? '' : ' (desactivado)'))));
  if (actual) sel.value = actual;
}

$('btn-tirada').addEventListener('click', async () => {
  const tipoId = Number($('sim-tipo').value);
  const tipo = datos.tipos.find((t) => t.id === tipoId);
  if (!tipo) return avisar('Crea un sobre primero', true);

  const escenario = $('sim-escenario');
  escenario.innerHTML = '';
  let sim = null;
  const accion = await reproducirApertura(escenario, {
    tipo,
    preparar: async () => {
      sim = await api('/api/admin/simular', { method: 'POST', body: { tipo_sobre_id: tipoId, tiradas: 2000 } });
      pintarEstadistica(sim);
      return { cantidad: sim.muestra.length };
    },
    elegir: async (posicion) => {
      const carta = sim.muestra[posicion - 1];
      return { cartas: sim.muestra, posicion_elegida: posicion, copia: { numero_serie: carta.copias_emitidas + 1 } };
    },
    botones: [{ texto: '↻ Otra tirada', valor: 'otra', primario: true }],
  });
  if (accion === 'otra') $('btn-tirada').click();
  else if (!escenario.children.length) escenario.appendChild(crear('div', 'escenario-vacio', 'Pulsa «Nueva tirada» para probar otra vez.'));
});

function pintarEstadistica(sim) {
  $('sim-stats').classList.remove('oculto');
  $('sim-n').textContent = sim.tiradas.toLocaleString('es-ES');
  const tipo = datos.tipos.find((t) => t.id === sim.tipo.id);
  const tabla = $('sim-tabla');
  tabla.innerHTML = '<thead><tr><th>Rareza</th><th>Configurado</th><th>Real</th><th>Simulado</th></tr></thead>';
  const cuerpo = crear('tbody');
  const totalConf = Object.values(tipo.probabilidades).reduce((s, v) => s + Number(v), 0) || 1;
  for (const r of Object.keys(RAREZAS)) {
    const tr = crear('tr', 'r-' + r);
    const nombre = crear('td');
    nombre.append(crear('span', 'punto'), ' ' + textoRareza(r));
    tr.append(
      nombre,
      crear('td', null, ((Number(tipo.probabilidades[r] || 0) / totalConf) * 100).toFixed(1) + '%'),
      crear('td', null, sim.reales[r].toFixed(1) + '%'),
      crear('td', null, `${sim.por_rareza[r].pct.toFixed(1)}% (${sim.por_rareza[r].veces})`),
    );
    cuerpo.appendChild(tr);
  }
  tabla.appendChild(cuerpo);

  const cartas = $('sim-cartas');
  cartas.innerHTML = '';
  cartas.appendChild(crear('div', 'etiqueta', 'Cartas que más salen'));
  for (const c of sim.por_carta.slice(0, 8)) {
    const it = crear('div', 'item-lista r-' + c.rareza);
    const n = crear('span', 'grow');
    n.append(crear('span', 'punto'), ' ' + c.nombre);
    it.append(n, crear('span', 'der', `${c.pct.toFixed(1)}%`));
    cartas.appendChild(it);
  }
}

// =====================================================================
// DROPS Y REGALOS
// =====================================================================
const regaloQue = segmentado('regalo-que', (v) => {
  $('campo-regalo-sobre').classList.toggle('oculto', v !== 'sobre');
  $('campo-regalo-carta').classList.toggle('oculto', v !== 'carta');
  $('regalo-cantidad').max = v === 'polvo' ? 100000 : 20;
  if (v === 'polvo' && Number($('regalo-cantidad').value) < 10) $('regalo-cantidad').value = 100;
  if (v !== 'polvo' && Number($('regalo-cantidad').value) > 20) $('regalo-cantidad').value = 1;
});
const regaloDestino = segmentado('regalo-destino', (v) => $('campo-regalo-login').classList.toggle('oculto', v !== 'usuario'));

function pintarSelectsRegalo() {
  const selTipo = $('regalo-tipo');
  selTipo.innerHTML = '';
  datos.tipos.filter((t) => t.activo).forEach((t) => selTipo.appendChild(opcion(t.id, t.nombre)));

  const selCarta = $('regalo-carta');
  selCarta.innerHTML = '';
  datos.cartas
    .filter((c) => c.activa)
    .sort((a, b) => RAREZAS[b.rareza].orden - RAREZAS[a.rareza].orden)
    .forEach((c) => {
      const agotada = c.limite_copias && c.copias_emitidas >= c.limite_copias;
      const stock = c.limite_copias ? ` (${c.limite_copias - c.copias_emitidas} libres)` : '';
      selCarta.appendChild(opcion(c.id, `${c.nombre} · ${textoRareza(c.rareza)}${stock}`, agotada));
    });

  const rapidos = $('drops-rapidos');
  rapidos.innerHTML = '';
  const activos = datos.tipos.filter((t) => t.activo);
  if (!activos.length) rapidos.appendChild(crear('p', 'sub', 'Crea un sobre para poder hacer drops.'));
  for (const t of activos) {
    const b = crear('button', 'drop-rapido');
    b.append(elementoPack(t), `🎁 ${t.nombre} → aleatorio`);
    b.addEventListener('click', () => enviarRegalo({ que: 'sobre', tipo_sobre_id: t.id, destino: 'aleatorio', cantidad: 1 }, b));
    rapidos.appendChild(b);
  }
}

function anotar(texto, error) {
  const lista = $('historial');
  if (lista.querySelector('p.sub')) lista.innerHTML = '';
  const it = crear('div', 'item-lista' + (error ? ' error' : ''));
  it.append(crear('span', 'grow', texto), crear('span', 'der', new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })));
  lista.prepend(it);
}

async function enviarRegalo(body, boton) {
  boton.disabled = true;
  try {
    const r = await api('/api/admin/regalar', { method: 'POST', body });
    const quien = r.destinatario.nombre || r.destinatario.login || 'usuario';
    const extra = r.total_activos ? ` (entre ${r.total_activos} conectados)` : '';
    anotar(`${r.entregado} → ${quien}${extra}`);
    avisar(`🎁 ¡Enviado a ${quien}!`);
    if (body.que === 'carta') await cargarCartas();
  } catch (e) {
    anotar(e.message, true);
    avisar(e.message, true);
  } finally {
    boton.disabled = false;
  }
}

$('btn-regalar').addEventListener('click', () => {
  const que = regaloQue();
  const destino = regaloDestino();
  const body = { que, destino, cantidad: Number($('regalo-cantidad').value || 1) };
  if (que === 'sobre') body.tipo_sobre_id = Number($('regalo-tipo').value);
  else body.carta_id = Number($('regalo-carta').value);
  if (destino === 'usuario') body.login = $('regalo-login').value;
  enviarRegalo(body, $('btn-regalar'));
});

// =====================================================================
// AJUSTES
// =====================================================================
async function cargarAjustes() {
  datos.ajustes = (await api('/api/admin/ajustes')).ajustes;
  $('aj-nombre').value = datos.ajustes.nombre_coleccion;
  $('aj-max').value = datos.ajustes.energia_max;
  $('aj-recarga').value = datos.ajustes.energia_recarga_min;
  $('marca-nombre').textContent = datos.ajustes.nombre_coleccion;
  $('aj-rareza-alerta').value = datos.ajustes.alerta_rareza_min;
  $('aj-cert-coste').value = datos.ajustes.certificacion_coste;
  $('aj-cert-min').value = datos.ajustes.certificacion_minutos;
  $('aj-cert-max').value = datos.ajustes.certificacion_max;
  const cajaPolvo = $('aj-polvo');
  cajaPolvo.innerHTML = '';
  for (const [r, info] of Object.entries(RAREZAS)) {
    const input = entrada('number', datos.ajustes.polvo_por_rareza?.[r] ?? 0, { min: 0, max: 100000 });
    input.dataset.rareza = r;
    cajaPolvo.appendChild(campo(info.nombre, input));
  }
  pintarUrlAlertas();
  resumenAjustes();
}

for (const [k, v] of Object.entries(RAREZAS)) $('aj-rareza-alerta').appendChild(opcion(k, v.nombre + (k === 'divina' ? '' : ' o superior')));

function pintarUrlAlertas() {
  const url = `${API}/obs/alertas.html?clave=${datos.ajustes.clave_alertas}`;
  $('aj-url-alertas').value = url;
  $('aj-url-prueba').value = url + '&prueba=1';
}
['aj-url-alertas', 'aj-url-prueba'].forEach((id) => $(id).addEventListener('focus', (e) => e.target.select()));

$('btn-copiar-alertas').addEventListener('click', async () => {
  const input = $('aj-url-alertas');
  input.select();
  try {
    await navigator.clipboard.writeText(input.value);
    avisar('URL copiada');
  } catch {
    const ok = document.execCommand && document.execCommand('copy');
    avisar(ok ? 'URL copiada' : 'Selecciónala y pulsa Ctrl+C', !ok);
  }
});

$('btn-nueva-clave').addEventListener('click', async (e) => {
  if (!confirmar(e.currentTarget)) return;
  try {
    datos.ajustes = (await api('/api/admin/ajustes', { method: 'PUT', body: { regenerar_clave: true } })).ajustes;
    pintarUrlAlertas();
    avisar('Nueva clave generada: actualiza la URL en OBS');
  } catch (err) {
    avisar(err.message, true);
  }
});

function resumenAjustes() {
  const max = Number($('aj-max').value || 0);
  const min = Number($('aj-recarga').value || 0);
  const horasLlenar = (max * min) / 60;
  $('aj-resumen').textContent = `Cada espectador consigue 1 sobre gratis cada ${min} min y puede acumular hasta ${max}. ` +
    `Con la energía vacía tarda ${horasLlenar >= 1 ? horasLlenar.toFixed(1) + ' h' : max * min + ' min'} en llenarse.`;
}
['aj-max', 'aj-recarga'].forEach((id) => $(id).addEventListener('input', resumenAjustes));

$('btn-guardar-ajustes').addEventListener('click', async () => {
  const boton = $('btn-guardar-ajustes');
  boton.disabled = true;
  try {
    datos.ajustes = (await api('/api/admin/ajustes', {
      method: 'PUT',
      body: {
        nombre_coleccion: $('aj-nombre').value,
        energia_max: Number($('aj-max').value),
        energia_recarga_min: Number($('aj-recarga').value),
        alerta_rareza_min: $('aj-rareza-alerta').value,
        certificacion_coste: Number($('aj-cert-coste').value || 0),
        certificacion_minutos: Number($('aj-cert-min').value || 60),
        certificacion_max: Number($('aj-cert-max').value || 3),
        polvo_por_rareza: Object.fromEntries([...$('aj-polvo').querySelectorAll('input')].map((i) => [i.dataset.rareza, Number(i.value || 0)])),
      },
    })).ajustes;
    $('marca-nombre').textContent = datos.ajustes.nombre_coleccion;
    avisar('Ajustes guardados');
  } catch (e) {
    avisar(e.message, true);
  } finally {
    boton.disabled = false;
  }
});

// =====================================================================
// ESPECTADORES
// =====================================================================
let busquedaEspectador;
$('buscar-espectador').addEventListener('input', () => {
  clearTimeout(busquedaEspectador);
  busquedaEspectador = setTimeout(cargarEspectadores, 300);
});

async function cargarEspectadores() {
  try {
    const { usuarios } = await api('/api/admin/usuarios?q=' + encodeURIComponent($('buscar-espectador').value.trim()));
    const cuerpo = $('tabla-espectadores');
    cuerpo.innerHTML = '';
    if (!usuarios.length) {
      const tr = crear('tr');
      const td = crear('td', 'sub', 'Todavía no hay espectadores (o ninguno coincide con la búsqueda).');
      td.colSpan = 7;
      tr.appendChild(td);
      cuerpo.appendChild(tr);
    }
    for (const u of usuarios) {
      const tr = crear('tr');
      const quien = crear('div', 'quien');
      const nombre = u.nombre || u.login || u.twitch_id;
      quien.append(crear('span', 'av', nombre.charAt(0).toUpperCase()), nombre);
      const enLinea = u.ultimo_visto && Date.now() - new Date(u.ultimo_visto).getTime() < 10 * 60 * 1000;
      if (enLinea) quien.appendChild(crear('span', 'en-linea'));
      const td = crear('td');
      td.appendChild(quien);
      tr.append(
        td,
        crear('td', null, String(u.cartas)),
        crear('td', null, String(u.distintas)),
        crear('td', null, String(u.sobres_abiertos)),
        crear('td', null, String(u.sobres_sin_abrir)),
        crear('td', null, '✦ ' + u.polvo),
        crear('td', 'sub', u.ultimo_visto ? hace(u.ultimo_visto) : '—'),
      );
      tr.addEventListener('click', () => verEspectador(u.twitch_id));
      cuerpo.appendChild(tr);
    }
  } catch (e) {
    avisar(e.message, true);
  }
}

async function verEspectador(id) {
  let d;
  try {
    d = await api('/api/admin/usuarios/detalle?id=' + encodeURIComponent(id));
  } catch (e) {
    return avisar(e.message, true);
  }
  const u = d.usuario;
  const nombre = u.nombre || u.login || u.twitch_id;
  cajon.abrir({ titulo: nombre, sub: u.login ? '@' + u.login : '' });

  const ficha = crear('div', 'ficha-perfil');
  ficha.append(crear('div', 'av', nombre.charAt(0).toUpperCase()), crear('h3', null, nombre));
  const datosU = crear('div', 'datos');
  const distintas = new Set(d.copias.map((c) => c.cartas?.id)).size;
  for (const [v, t] of [[d.copias.length, 'Cartas'], [distintas, 'Distintas'], ['✦ ' + u.polvo, 'Polvo'], [d.sobres.length, 'Sobres sin abrir']]) {
    const caja = crear('div');
    caja.append(crear('b', null, String(v)), crear('span', null, t));
    datosU.appendChild(caja);
  }
  ficha.appendChild(datosU);
  ficha.appendChild(crear('div', 'sub', `Se unió el ${fechaCorta(u.creado_en)} · última vez ${u.ultimo_visto ? hace(u.ultimo_visto) : '—'}`));
  $('cajon-preview').appendChild(ficha);

  const cuerpo = $('cajon-cuerpo');
  cuerpo.appendChild(crear('div', 'etiqueta', `Colección (${d.copias.length})`));
  const rejilla = crear('div', 'mini-rejilla');
  rejilla.style.marginTop = '10px';
  for (const c of d.copias) if (c.cartas) rejilla.appendChild(elementoCarta(c.cartas, { serie: c.numero_serie, nota: c.nota }));
  if (!d.copias.length) rejilla.appendChild(crear('p', 'sub', 'Aún no tiene cartas.'));
  cuerpo.appendChild(rejilla);

  const pie = $('cajon-pie');
  pie.appendChild(crear('div', 'espacio'));
  const regalar = crear('button', 'btn primario', '🎁 Regalarle algo');
  regalar.addEventListener('click', () => {
    cajon.cerrar();
    irA('drops');
    $('regalo-destino').querySelector('[data-v=usuario]').click();
    $('regalo-login').value = u.login || '';
    $('regalo-login').focus();
  });
  pie.appendChild(regalar);
}

// =====================================================================
// PROBABILIDAD DE APARICIÓN de una carta (editor de cartas)
// =====================================================================
function formatoPct(p) {
  const pct = p * 100;
  if (pct >= 10) return pct.toFixed(0) + '%';
  if (pct >= 1) return pct.toFixed(1) + '%';
  if (pct >= 0.1) return pct.toFixed(2) + '%';
  return pct.toFixed(3) + '%';
}

function unoDeCada(p) {
  if (p <= 0) return '—';
  const n = Math.round(1 / p);
  return n <= 1 ? 'casi siempre' : `1 de cada ${n.toLocaleString('es-ES')}`;
}

function tablaAparicion(c) {
  const caja = crear('div', 'aparicion');
  caja.appendChild(crear('div', 'prob-titulo', 'Probabilidad de aparición'));
  const editada = { ...c, grupo: (c.grupo || '').trim() || null };
  const tipos = datos.tipos.filter((t) => t.activo);
  if (!tipos.length) {
    caja.appendChild(crear('p', 'sub', 'Crea un sobre para ver con qué frecuencia saldrá esta carta.'));
    return caja;
  }

  for (const t of tipos) {
    const fila = crear('div', 'ap-fila');
    const cab = crear('div', 'ap-cab');
    cab.append(crear('b', null, t.nombre), crear('span', 'sub', `${t.cartas_por_sobre} cartas`));
    fila.appendChild(cab);

    const grupos = t.grupos || [];
    let motivo = null;
    if (!editada.activa) motivo = 'Desactivada: no sale en sobres';
    else if (editada.limite_copias != null && (editada.copias_emitidas || 0) >= editada.limite_copias) motivo = 'Agotada';
    else if (grupos.length && !grupos.includes(editada.grupo)) motivo = `No está en este sobre (grupos: ${grupos.join(', ')})`;

    if (motivo) {
      fila.appendChild(crear('div', 'ap-no', motivo));
      caja.appendChild(fila);
      continue;
    }

    const pool = datos.cartas.filter((x) => x.id !== editada.id && puedeSalir(x, grupos));
    pool.push(editada);
    const { reales } = realesLocales(t.probabilidades, grupos, pool);
    const mismas = pool.filter((x) => x.rareza === editada.rareza).length;
    const porHueco = (reales[editada.rareza] / 100) / mismas;
    const enSobre = 1 - Math.pow(1 - porHueco, t.cartas_por_sobre);

    const datosFila = crear('div', 'ap-datos');
    const dato = (valor, texto, extra) => {
      const d = crear('div');
      d.append(crear('b', null, valor), crear('span', null, texto));
      if (extra) d.appendChild(crear('small', null, extra));
      datosFila.appendChild(d);
    };
    dato(formatoPct(porHueco), 'por carta boca abajo');
    dato(formatoPct(enSobre), 'aparece en el sobre', unoDeCada(enSobre) + ' sobres');
    dato(formatoPct(porHueco), 'conseguirla', unoDeCada(porHueco) + ' sobres');
    fila.appendChild(datosFila);
    fila.appendChild(crear('div', 'ap-nota', `${textoRareza(editada.rareza)}: ${reales[editada.rareza].toFixed(1)}% del sobre, repartido entre ${mismas} carta${mismas === 1 ? '' : 's'}`));
    caja.appendChild(fila);
  }
  return caja;
}
