// Rutas del panel de admin. Todas exigen ser el propietario del canal.
import { cuerpo, HttpError } from '../http.js';
import { requiereAdmin, buscarUsuarioTwitch, twitchApiConfigurada } from '../twitch.js';
import { getDb, check, CAMPOS_CARTA, cartasDisponibles } from '../supabase.js';
import { RAREZAS, sortearCartas, probabilidadesReales } from '../sorteo.js';

const texto = (v, max) => {
  const t = String(v ?? '').trim().slice(0, max);
  return t || null;
};

// ===================================================================
// CARTAS  GET | POST | PUT | DELETE  /api/admin/cartas
// ===================================================================
function limpiarCarta(body, parcial) {
  const carta = {};
  const tiene = (k) => !parcial || k in body;

  if (tiene('nombre')) {
    carta.nombre = texto(body.nombre, 40);
    if (!carta.nombre) throw new HttpError(400, 'FALTA_NOMBRE', 'La carta necesita un nombre');
  }
  if (tiene('imagen_url')) {
    carta.imagen_url = String(body.imagen_url || '').trim();
    if (!/^https:\/\//.test(carta.imagen_url)) throw new HttpError(400, 'URL_IMAGEN_NO_VALIDA', 'La imagen debe ser una URL que empiece por https://');
  }
  if (tiene('rareza')) {
    carta.rareza = body.rareza;
    if (!RAREZAS.includes(carta.rareza)) throw new HttpError(400, 'RAREZA_NO_VALIDA');
  }
  if ('descripcion' in body) carta.descripcion = texto(body.descripcion, 160);
  if ('frase' in body) carta.frase = texto(body.frase, 120);
  if ('artista' in body) carta.artista = texto(body.artista, 40);
  if ('grupo' in body) carta.grupo = texto(body.grupo, 40);
  if ('coste' in body) {
    const coste = Number(body.coste || 0);
    if (!Number.isInteger(coste) || coste < 0 || coste > 99) throw new HttpError(400, 'COSTE_NO_VALIDO', 'El coste va de 0 a 99');
    carta.coste = coste;
  }
  if ('limite_copias' in body) {
    const vacio = body.limite_copias === '' || body.limite_copias === null || body.limite_copias === undefined;
    const limite = vacio ? null : Number(body.limite_copias);
    if (limite !== null && (!Number.isInteger(limite) || limite < 1)) throw new HttpError(400, 'LIMITE_NO_VALIDO');
    carta.limite_copias = limite;
  }
  if ('activa' in body) carta.activa = Boolean(body.activa);
  return carta;
}

export async function cartas(req) {
  requiereAdmin(req);
  const db = getDb();

  if (req.method === 'GET') {
    return { cartas: check(await db.from('cartas').select(CAMPOS_CARTA).order('id')) };
  }

  const body = cuerpo(req);
  if (req.method === 'POST') {
    return { carta: check(await db.from('cartas').insert(limpiarCarta(body, false)).select(CAMPOS_CARTA).single()) };
  }

  const id = Number(body.id);
  if (!id) throw new HttpError(400, 'FALTA_ID');
  const actual = check(await db.from('cartas').select('copias_emitidas').eq('id', id).maybeSingle());
  if (!actual) throw new HttpError(404, 'CARTA_NO_ENCONTRADA');

  if (req.method === 'DELETE') {
    if (actual.copias_emitidas > 0) {
      throw new HttpError(409, 'CARTA_CON_COPIAS', 'Ya hay copias de esta carta en colecciones. Desactívala en lugar de borrarla.');
    }
    const { count } = await db.from('sobres').select('id', { count: 'exact', head: true }).eq('estado', 'sorteado').contains('cartas_sorteadas', [id]);
    if (count) throw new HttpError(409, 'CARTA_EN_USO', 'Alguien está abriendo un sobre con esta carta ahora mismo. Prueba en un momento.');
    check(await db.from('cartas').delete().eq('id', id));
    return { ok: true };
  }

  const cambios = limpiarCarta(body, true);
  if (cambios.limite_copias != null && cambios.limite_copias < actual.copias_emitidas) {
    throw new HttpError(400, 'LIMITE_MENOR_QUE_EMITIDAS', `Ya hay ${actual.copias_emitidas} copias emitidas, el límite no puede ser menor`);
  }
  return { carta: check(await db.from('cartas').update(cambios).eq('id', id).select(CAMPOS_CARTA).single()) };
}

// ===================================================================
// TIPOS DE SOBRE (boosters)  GET | POST | PUT | DELETE  /api/admin/tipos-sobre
// ===================================================================
function limpiarTipo(body, parcial) {
  const tipo = {};
  if (!parcial || 'nombre' in body) {
    tipo.nombre = texto(body.nombre, 40);
    if (!tipo.nombre) throw new HttpError(400, 'FALTA_NOMBRE', 'El sobre necesita un nombre');
  }
  if ('imagen_url' in body) {
    tipo.imagen_url = texto(body.imagen_url, 500);
    if (tipo.imagen_url && !/^https:\/\//.test(tipo.imagen_url)) throw new HttpError(400, 'URL_IMAGEN_NO_VALIDA', 'La portada debe ser una URL https://');
  }
  if ('cartas_por_sobre' in body) {
    const n = Number(body.cartas_por_sobre);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw new HttpError(400, 'CANTIDAD_NO_VALIDA', 'Entre 1 y 10 cartas');
    tipo.cartas_por_sobre = n;
  }
  if ('modo' in body) {
    if (!['energia', 'regalo'].includes(body.modo)) throw new HttpError(400, 'MODO_NO_VALIDO');
    tipo.modo = body.modo;
  }
  if ('grupos' in body) {
    const lista = Array.isArray(body.grupos) ? body.grupos.map((g) => texto(g, 40)).filter(Boolean) : [];
    tipo.grupos = lista.length ? [...new Set(lista)] : null;
  }
  if ('orden' in body) tipo.orden = Number(body.orden) || 0;
  if (!parcial || 'probabilidades' in body) {
    const p = body.probabilidades || {};
    const limpio = {};
    for (const r of RAREZAS) {
      const v = Number(p[r] || 0);
      if (!(v >= 0)) throw new HttpError(400, 'PROBABILIDAD_NO_VALIDA');
      limpio[r] = Math.round(v * 100) / 100;
    }
    if (Object.values(limpio).every((v) => v === 0)) throw new HttpError(400, 'PROBABILIDADES_VACIAS', 'Al menos una rareza debe tener %');
    tipo.probabilidades = limpio;
  }
  if ('activo' in body) tipo.activo = Boolean(body.activo);
  return tipo;
}

export async function tiposSobre(req) {
  requiereAdmin(req);
  const db = getDb();

  if (req.method === 'GET') {
    const [tipos, cartasActivas] = await Promise.all([
      db.from('tipos_sobre').select('*').order('orden').order('id').then(check),
      cartasDisponibles(db, null),
    ]);
    // Para cada sobre: cuántas cartas puede dar de cada rareza y % reales
    for (const t of tipos) {
      const pool = cartasActivas.filter((c) => !t.grupos?.length || t.grupos.includes(c.grupo));
      t.pool = Object.fromEntries(RAREZAS.map((r) => [r, pool.filter((c) => c.rareza === r).length]));
      Object.assign(t, probabilidadesReales(pool, t.probabilidades));
    }
    return { tipos };
  }

  const body = cuerpo(req);
  if (req.method === 'POST') {
    return { tipo: check(await db.from('tipos_sobre').insert(limpiarTipo(body, false)).select().single()) };
  }

  const id = Number(body.id);
  if (!id) throw new HttpError(400, 'FALTA_ID');

  if (req.method === 'DELETE') {
    const { count } = await db.from('sobres').select('id', { count: 'exact', head: true }).eq('tipo_sobre_id', id);
    if (count) throw new HttpError(409, 'SOBRE_EN_USO', `Ya se han repartido ${count} sobres de este tipo. Desactívalo en lugar de borrarlo.`);
    check(await db.from('tipos_sobre').delete().eq('id', id));
    return { ok: true };
  }
  return { tipo: check(await db.from('tipos_sobre').update(limpiarTipo(body, true)).eq('id', id).select().single()) };
}

// ===================================================================
// REGALOS Y DROPS  POST /api/admin/regalar
// { que: sobre|carta, tipo_sobre_id|carta_id, destino: usuario|aleatorio, login, cantidad }
// "aleatorio" = alguien con la extensión abierta en los últimos 10 min
// ===================================================================
const MINUTOS_ACTIVO = 10;

async function elegirDestinatario(db, body, adminId) {
  if (body.destino === 'aleatorio') {
    const desde = new Date(Date.now() - MINUTOS_ACTIVO * 60 * 1000).toISOString();
    const activos = check(
      await db.from('usuarios').select('twitch_id, login, nombre').gte('ultimo_visto', desde).neq('twitch_id', adminId),
    );
    if (activos.length === 0) {
      throw new HttpError(404, 'NADIE_CONECTADO', `Nadie ha tenido la extensión abierta en los últimos ${MINUTOS_ACTIVO} minutos`);
    }
    return { ...activos[Math.floor(Math.random() * activos.length)], total_activos: activos.length };
  }

  const login = String(body.login || '').trim().toLowerCase().replace(/^@/, '');
  if (!login) throw new HttpError(400, 'FALTA_USUARIO', 'Escribe el nombre de Twitch');

  const conocido = check(await db.from('usuarios').select('twitch_id, login, nombre').eq('login', login).maybeSingle());
  if (conocido) return conocido;

  if (!twitchApiConfigurada()) {
    throw new HttpError(404, 'USUARIO_NO_ENCONTRADO', 'Ese usuario no ha abierto nunca la extensión (y falta TWITCH_CLIENT_SECRET para buscarlo en Twitch)');
  }
  const info = await buscarUsuarioTwitch({ login });
  if (!info) throw new HttpError(404, 'USUARIO_NO_ENCONTRADO', `No existe el usuario de Twitch "${login}"`);

  check(await db.from('usuarios').upsert({ twitch_id: info.id, login: info.login, nombre: info.nombre }, { onConflict: 'twitch_id' }));
  return { twitch_id: info.id, login: info.login, nombre: info.nombre };
}

export async function regalar(req) {
  const admin = requiereAdmin(req);
  const body = cuerpo(req);
  const db = getDb();

  const cantidad = Number(body.cantidad || 1);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) throw new HttpError(400, 'CANTIDAD_NO_VALIDA', 'Entre 1 y 20');
  if (!['sobre', 'carta'].includes(body.que)) throw new HttpError(400, 'QUE_NO_VALIDO');
  if (!['usuario', 'aleatorio'].includes(body.destino)) throw new HttpError(400, 'DESTINO_NO_VALIDO');

  const destinatario = await elegirDestinatario(db, body, admin.userId);
  const resultado = {
    destinatario: { login: destinatario.login, nombre: destinatario.nombre },
    total_activos: destinatario.total_activos,
  };

  if (body.que === 'sobre') {
    const tipo = check(await db.from('tipos_sobre').select('id, nombre').eq('id', Number(body.tipo_sobre_id)).maybeSingle());
    if (!tipo) throw new HttpError(404, 'TIPO_SOBRE_NO_ENCONTRADO');
    const origen = body.destino === 'aleatorio' ? 'drop_aleatorio' : 'regalo';
    const filas = Array.from({ length: cantidad }, () => ({ usuario_id: destinatario.twitch_id, tipo_sobre_id: tipo.id, origen }));
    check(await db.from('sobres').insert(filas));
    return { ...resultado, entregado: `${cantidad} × ${tipo.nombre}` };
  }

  const carta = check(await db.from('cartas').select('id, nombre').eq('id', Number(body.carta_id)).maybeSingle());
  if (!carta) throw new HttpError(404, 'CARTA_NO_ENCONTRADA');
  const series = [];
  for (let i = 0; i < cantidad; i++) {
    const copia = check(
      await db.rpc('emitir_copia', { p_carta_id: carta.id, p_usuario_id: destinatario.twitch_id, p_sobre_id: null, p_origen: 'drop_carta' }),
    );
    if (!copia?.id) {
      if (series.length === 0) throw new HttpError(409, 'SIN_STOCK', 'Esa carta está agotada o desactivada');
      break;
    }
    series.push(copia.numero_serie);
  }
  return { ...resultado, entregado: `${carta.nombre} ${series.map((n) => '#' + n).join(', ')}` };
}

// ===================================================================
// AJUSTES  GET | PUT  /api/admin/ajustes
// ===================================================================
export async function ajustes(req) {
  requiereAdmin(req);
  const db = getDb();
  if (req.method === 'GET') return { ajustes: check(await db.from('ajustes').select('*').eq('id', 1).single()) };

  const body = cuerpo(req);
  const cambios = {};
  if ('energia_max' in body) cambios.energia_max = Number(body.energia_max);
  if ('energia_recarga_min' in body) cambios.energia_recarga_min = Number(body.energia_recarga_min);
  if ('nombre_coleccion' in body) cambios.nombre_coleccion = texto(body.nombre_coleccion, 30) || 'Cartas';
  return { ajustes: check(await db.from('ajustes').update(cambios).eq('id', 1).select().single()) };
}

// ===================================================================
// RESUMEN  GET /api/admin/resumen
// ===================================================================
export async function resumen(req) {
  requiereAdmin(req);
  const db = getDb();
  const hace10 = new Date(Date.now() - MINUTOS_ACTIVO * 60 * 1000).toISOString();
  const contar = (q) => q.then((r) => r.count ?? 0);

  const [usuarios, activos, copias, sobresPendientes, ranking, ultimas, cartasLista] = await Promise.all([
    contar(db.from('usuarios').select('twitch_id', { count: 'exact', head: true })),
    contar(db.from('usuarios').select('twitch_id', { count: 'exact', head: true }).gte('ultimo_visto', hace10)),
    contar(db.from('copias').select('id', { count: 'exact', head: true })),
    contar(db.from('sobres').select('id', { count: 'exact', head: true }).neq('estado', 'abierto')),
    db.rpc('ranking_semanal', { p_limite: 1000 }).then(check),
    db
      .from('copias')
      .select('id, numero_serie, obtenida_en, origen, cartas(nombre, rareza, limite_copias), usuarios(nombre, login)')
      .order('obtenida_en', { ascending: false })
      .limit(12)
      .then(check),
    db.from('cartas').select('id, activa, limite_copias, copias_emitidas').then(check),
  ]);

  return {
    usuarios,
    activos_ahora: activos,
    copias,
    sobres_sin_abrir: sobresPendientes,
    sobres_semana: ranking.reduce((s, f) => s + Number(f.sobres), 0),
    cartas: cartasLista.length,
    cartas_activas: cartasLista.filter((c) => c.activa).length,
    agotadas: cartasLista.filter((c) => c.limite_copias && c.copias_emitidas >= c.limite_copias).length,
    top: ranking.slice(0, 5).map((f) => ({ posicion: f.posicion, nombre: f.nombre, sobres: f.sobres })),
    ultimas: ultimas.map((c) => ({
      carta: c.cartas?.nombre,
      rareza: c.cartas?.rareza,
      serie: c.numero_serie,
      limite: c.cartas?.limite_copias,
      usuario: c.usuarios?.nombre || c.usuarios?.login || 'Anónimo',
      fecha: c.obtenida_en,
      origen: c.origen,
    })),
  };
}

// ===================================================================
// SIMULADOR  POST /api/admin/simular { tipo_sobre_id, tiradas }
// No guarda nada: sortea en memoria y devuelve estadísticas + una tirada de ejemplo
// ===================================================================
export async function simular(req) {
  requiereAdmin(req);
  const db = getDb();
  const body = cuerpo(req);
  const tiradas = Math.min(10000, Math.max(1, Number(body.tiradas) || 1000));

  const tipo = check(await db.from('tipos_sobre').select('*').eq('id', Number(body.tipo_sobre_id)).maybeSingle());
  if (!tipo) throw new HttpError(404, 'TIPO_SOBRE_NO_ENCONTRADO');

  const pool = await cartasDisponibles(db, tipo.grupos);
  const porId = new Map(pool.map((c) => [c.id, c]));
  const muestra = sortearCartas(pool, tipo.probabilidades, tipo.cartas_por_sobre).map((id) => porId.get(id));

  // Estadística: en cada tirada el usuario se queda 1 carta al azar de las N
  const porRareza = Object.fromEntries(RAREZAS.map((r) => [r, 0]));
  const porCarta = {};
  for (let i = 0; i < tiradas; i++) {
    const ids = sortearCartas(pool, tipo.probabilidades, tipo.cartas_por_sobre);
    const elegida = porId.get(ids[Math.floor(Math.random() * ids.length)]);
    porRareza[elegida.rareza]++;
    porCarta[elegida.id] = (porCarta[elegida.id] || 0) + 1;
  }

  const masSalen = Object.entries(porCarta)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ nombre: porId.get(Number(id)).nombre, rareza: porId.get(Number(id)).rareza, veces: n, pct: (n / tiradas) * 100 }));

  return {
    tipo: { id: tipo.id, nombre: tipo.nombre, imagen_url: tipo.imagen_url, cartas_por_sobre: tipo.cartas_por_sobre },
    tiradas,
    muestra,
    por_rareza: Object.fromEntries(RAREZAS.map((r) => [r, { veces: porRareza[r], pct: (porRareza[r] / tiradas) * 100 }])),
    por_carta: masSalen,
    ...probabilidadesReales(pool, tipo.probabilidades),
  };
}
