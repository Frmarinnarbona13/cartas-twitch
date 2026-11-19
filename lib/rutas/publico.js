// Rutas que usa la vista del espectador.
import { timingSafeEqual } from 'node:crypto';
import { cuerpo, HttpError } from '../http.js';
import { autenticar, requiereUsuario, canalEnDirecto } from '../twitch.js';
import { getDb, check, CAMPOS_CARTA, cartasDisponibles } from '../supabase.js';
import { registrarVisita } from '../usuarios.js';
import { sortearCartas } from '../sorteo.js';
import { evaluarLogros, estadoDiaria, LOGROS } from '../logros.js';

// Avanza las certificaciones (solo suma tiempo si el canal está en directo)
async function tickCertificaciones(db, auth) {
  const enDirecto = await canalEnDirecto(auth.canalId);
  check(await db.rpc('avanzar_certificaciones', { p_usuario: auth.userId, p_en_directo: enDirecto }));
  return enDirecto;
}

async function certificacionesDe(db, userId) {
  return check(
    await db
      .from('certificaciones')
      .select('id, copia_id, minutos_necesarios, minutos_acumulados, estado, creado_en')
      .eq('usuario_id', userId)
      .neq('estado', 'recogida')
      .order('creado_en'),
  );
}

async function contarIntercambios(db, userId) {
  const { count } = await db.from('intercambios').select('id', { count: 'exact', head: true }).eq('para_usuario', userId).eq('estado', 'pendiente');
  return count ?? 0;
}

async function energiaDe(db, userId) {
  return check(await db.rpc('estado_energia', { p_usuario: userId }))[0];
}

// GET /api/yo — todo lo que necesita la extensión al abrirse
export async function yo(req) {
  const auth = autenticar(req);
  const db = getDb();
  const ajustes = check(
    await db.from('ajustes').select('nombre_coleccion, polvo_por_rareza, certificacion_coste, certificacion_minutos, certificacion_max').eq('id', 1).single(),
  );
  const base = {
    ahora: new Date().toISOString(),
    es_admin: auth.rol === 'broadcaster',
    nombre_coleccion: ajustes.nombre_coleccion,
    polvo_por_rareza: ajustes.polvo_por_rareza,
    certificacion: { coste: ajustes.certificacion_coste, minutos: ajustes.certificacion_minutos, max: ajustes.certificacion_max },
  };
  if (!auth.userId) return { ...base, identidad: false };

  const usuario = await registrarVisita(auth.userId);
  const enDirecto = await tickCertificaciones(db, auth);

  const [energia, packs, reserva, copias, cartas, intercambios, tienda, saldo, certificaciones] = await Promise.all([
    energiaDe(db, auth.userId),
    db
      .from('tipos_sobre')
      .select('id, nombre, imagen_url, cartas_por_sobre, efecto')
      .eq('activo', true)
      .eq('modo', 'energia')
      .order('orden')
      .order('id')
      .then(check),
    db
      .from('sobres')
      .select('id, estado, origen, creado_en, tipos_sobre(id, nombre, imagen_url, cartas_por_sobre, efecto)')
      .eq('usuario_id', auth.userId)
      .neq('estado', 'abierto')
      .order('creado_en')
      .then(check),
    db
      .from('copias')
      .select('id, carta_id, numero_serie, obtenida_en, nota')
      .eq('usuario_id', auth.userId)
      .order('obtenida_en', { ascending: false })
      .then(check),
    db.from('cartas').select(CAMPOS_CARTA).order('id').then(check),
    contarIntercambios(db, auth.userId),
    db
      .from('tipos_sobre')
      .select('id, nombre, imagen_url, cartas_por_sobre, precio_polvo, efecto')
      .eq('activo', true)
      .not('precio_polvo', 'is', null)
      .order('precio_polvo')
      .then(check),
    db.from('usuarios').select('polvo, racha, ultima_diaria').eq('twitch_id', auth.userId).single().then(check),
    certificacionesDe(db, auth.userId),
  ]);
  const logros = await evaluarLogros(auth.userId);
  const recompensas = {
    diaria: estadoDiaria(saldo),
    logros_listos: logros.filter((l) => l.completado && !l.reclamado).length,
  };

  // Catálogo del álbum: cartas activas + las desactivadas que el usuario ya tiene
  const tengo = new Set(copias.map((c) => c.carta_id));
  const catalogo = cartas.filter((c) => c.activa || tengo.has(c.id));

  return { ...base, identidad: true, usuario: { nombre: usuario.nombre || usuario.login, polvo: saldo.polvo }, energia, tienda, packs, reserva, copias, catalogo, intercambios_pendientes: intercambios, certificaciones, en_directo: enDirecto, recompensas };
}

// GET /api/ping — cada 2 minutos: "sigo aquí" + novedades
export async function ping(req) {
  const auth = autenticar(req);
  if (!auth.userId) return { identidad: false };
  const db = getDb();

  await registrarVisita(auth.userId);
  const enDirecto = await tickCertificaciones(db, auth);
  const [{ count }, energia, intercambios, certificaciones] = await Promise.all([
    db.from('sobres').select('id', { count: 'exact', head: true }).eq('usuario_id', auth.userId).neq('estado', 'abierto'),
    energiaDe(db, auth.userId),
    contarIntercambios(db, auth.userId),
    certificacionesDe(db, auth.userId),
  ]);
  return {
    identidad: true, sobres_sin_abrir: count ?? 0, energia, intercambios_pendientes: intercambios,
    certificaciones, en_directo: enDirecto, ahora: new Date().toISOString(),
  };
}

// POST /api/sobres/energia { tipo_sobre_id } — gasta 1 de energía y crea el sobre
export async function usarEnergia(req) {
  const { userId } = requiereUsuario(req);
  const db = getDb();
  await registrarVisita(userId);
  const sobreId = check(await db.rpc('usar_energia', { p_usuario: userId, p_tipo: Number(cuerpo(req).tipo_sobre_id) }));
  return { sobre_id: sobreId, energia: await energiaDe(db, userId) };
}

// POST /api/sobres/abrir { sobre_id } — sortea en secreto (no dice qué cartas son)
export async function abrir(req) {
  const { userId } = requiereUsuario(req);
  const sobreId = Number(cuerpo(req).sobre_id);
  const db = getDb();

  const sobre = check(
    await db
      .from('sobres')
      .select('id, estado, usuario_id, tipos_sobre(cartas_por_sobre, probabilidades, grupos, imagen_url, nombre, efecto)')
      .eq('id', sobreId)
      .maybeSingle(),
  );
  if (!sobre || sobre.usuario_id !== userId) throw new HttpError(404, 'SOBRE_NO_ENCONTRADO');

  const tipo = sobre.tipos_sobre;
  const respuesta = { sobre_id: sobre.id, cantidad: tipo.cartas_por_sobre, nombre: tipo.nombre, imagen_url: tipo.imagen_url, efecto: tipo.efecto };

  if (sobre.estado === 'sorteado') return respuesta; // recargó antes de elegir
  if (sobre.estado !== 'pendiente') throw new HttpError(409, 'SOBRE_YA_ABIERTO');

  const disponibles = await cartasDisponibles(db, tipo.grupos);
  const ids = sortearCartas(disponibles, tipo.probabilidades, tipo.cartas_por_sobre);

  // Solo si sigue "pendiente": dos clics a la vez no sortean dos veces
  check(
    await db
      .from('sobres')
      .update({ estado: 'sorteado', cartas_sorteadas: ids })
      .eq('id', sobre.id)
      .eq('estado', 'pendiente'),
  );
  return respuesta;
}

// POST /api/sobres/elegir { sobre_id, posicion } — se queda solo con la elegida
export async function elegir(req) {
  const { userId } = requiereUsuario(req);
  const body = cuerpo(req);
  const sobreId = Number(body.sobre_id);
  const posicion = Number(body.posicion);
  const db = getDb();

  const copia = check(
    await db.rpc('elegir_carta', { p_sobre_id: sobreId, p_usuario_id: userId, p_posicion: posicion }),
  );
  const sobre = check(
    await db.from('sobres').select('cartas_sorteadas, posicion_elegida').eq('id', sobreId).single(),
  );
  const cartas = check(await db.from('cartas').select(CAMPOS_CARTA).in('id', [...new Set(sobre.cartas_sorteadas)]));
  const porId = new Map(cartas.map((c) => [c.id, c]));

  return {
    posicion_elegida: sobre.posicion_elegida,
    cartas: sobre.cartas_sorteadas.map((id) => porId.get(id)),
    copia: { id: copia.id, carta_id: copia.carta_id, numero_serie: copia.numero_serie, obtenida_en: copia.obtenida_en },
  };
}

// GET /api/ranking — sobres abiertos esta semana
export async function ranking(req) {
  const auth = autenticar(req);
  const filas = check(await getDb().rpc('ranking_semanal', { p_limite: 1000 }));
  const mia = auth.userId ? filas.find((f) => f.twitch_id === auth.userId) : null;
  return {
    top: filas.slice(0, 50).map((f) => ({
      posicion: f.posicion,
      nombre: f.nombre,
      sobres: f.sobres,
      soy_yo: f.twitch_id === auth.userId,
    })),
    yo: mia ? { posicion: mia.posicion, sobres: mia.sobres } : null,
    participantes: filas.length,
  };
}

// GET /api/arte?c1=4ade80&c2=14532d&lados=5 — ilustración SVG de relleno para pruebas
export function arte(req, res) {
  const color = (v, defecto) => (/^[0-9a-f]{6}$/i.test(v || '') ? '#' + v : defecto);
  const c1 = color(req.query.c1, '#8b5cf6');
  const c2 = color(req.query.c2, '#1e1b4b');
  const lados = Math.min(8, Math.max(3, Number(req.query.lados) || 5));

  const puntos = Array.from({ length: lados }, (_, k) => {
    const a = (2 * Math.PI * k) / lados - Math.PI / 2;
    return `${(150 + 80 * Math.cos(a)).toFixed(1)},${(120 + 80 * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 240">
<defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
<rect width="300" height="240" fill="url(#g)"/>
<polygon points="${puntos}" fill="#fff" opacity=".16"/>
<circle cx="150" cy="122" r="52" fill="${c2}" stroke="#fff" stroke-width="5" opacity=".92"/>
<circle cx="133" cy="110" r="8" fill="#fff"/><circle cx="167" cy="110" r="8" fill="#fff"/>
<path d="M130 140 Q150 156 170 140" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(svg);
}

// GET /api/alertas?clave=…&desde=ISO — para la fuente de navegador de OBS (sin Twitch)
const ORDEN_RAREZA = ['comun', 'rara', 'epica', 'legendaria', 'divina'];
export async function alertas(req) {
  const db = getDb();
  const ajustes = check(await db.from('ajustes').select('clave_alertas, alerta_rareza_min, nombre_coleccion').eq('id', 1).single());
  const recibida = Buffer.from(String(req.query.clave || ''));
  const esperada = Buffer.from(ajustes.clave_alertas);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    throw new HttpError(403, 'CLAVE_NO_VALIDA', 'La clave de alertas no es correcta');
  }

  const ahora = new Date();
  const limite = new Date(ahora.getTime() - 60 * 60 * 1000);
  let desde = new Date(String(req.query.desde || ''));
  if (isNaN(desde) || desde < limite) desde = limite;

  const rarezas = ORDEN_RAREZA.slice(ORDEN_RAREZA.indexOf(ajustes.alerta_rareza_min));
  const filas = check(
    await db
      .from('copias')
      .select(`id, numero_serie, obtenida_en, origen, cartas!inner(${CAMPOS_CARTA}), usuarios(nombre, login)`)
      .gt('obtenida_en', desde.toISOString())
      .in('cartas.rareza', rarezas)
      .order('obtenida_en')
      .limit(20),
  );
  return {
    ahora: ahora.toISOString(),
    coleccion: ajustes.nombre_coleccion,
    alertas: filas.map((f) => ({
      id: f.id,
      usuario: f.usuarios?.nombre || f.usuarios?.login || 'Alguien',
      carta: f.cartas,
      numero_serie: f.numero_serie,
      origen: f.origen,
      fecha: f.obtenida_en,
    })),
  };
}

// POST /api/polvo/desmontar { copias: [id] } — convierte copias en polvo
export async function desmontar(req) {
  const { userId } = requiereUsuario(req);
  const ids = Array.isArray(cuerpo(req).copias) ? [...new Set(cuerpo(req).copias.map(Number).filter((n) => n > 0))] : [];
  const r = check(await getDb().rpc('desmontar_copias', { p_usuario: userId, p_ids: ids }))[0];
  return { ganado: r.ganado, polvo: r.total };
}

// POST /api/tienda/comprar { tipo_sobre_id } — compra un sobre con polvo
export async function comprar(req) {
  const { userId } = requiereUsuario(req);
  const db = getDb();
  const sobreId = check(await db.rpc('comprar_sobre', { p_usuario: userId, p_tipo: Number(cuerpo(req).tipo_sobre_id) }));
  const { polvo } = check(await db.from('usuarios').select('polvo').eq('twitch_id', userId).single());
  return { sobre_id: sobreId, polvo };
}

// POST /api/certificar { copia_id } — envía una carta a certificar
export async function certificar(req) {
  const { userId } = requiereUsuario(req);
  const db = getDb();
  const id = check(await db.rpc('certificar', { p_usuario: userId, p_copia: Number(cuerpo(req).copia_id) }));
  const [{ polvo }, certificaciones] = await Promise.all([
    db.from('usuarios').select('polvo').eq('twitch_id', userId).single().then(check),
    certificacionesDe(db, userId),
  ]);
  return { id, polvo, certificaciones };
}

// POST /api/certificar/recoger { id } — recoge una certificación terminada y revela la nota
export async function recogerCertificacion(req) {
  const { userId } = requiereUsuario(req);
  const db = getDb();
  const id = Number(cuerpo(req).id);
  const nota = check(await db.rpc('recoger_certificacion', { p_usuario: userId, p_id: id }));
  const cert = check(await db.from('certificaciones').select('copia_id').eq('id', id).single());
  const copia = check(await db.from('copias').select(`id, numero_serie, nota, cartas(${CAMPOS_CARTA})`).eq('id', cert.copia_id).single());
  return { nota, copia: { id: copia.id, numero_serie: copia.numero_serie, nota: copia.nota }, carta: copia.cartas };
}

// GET /api/logros — logros con su progreso + recompensa diaria
export async function logros(req) {
  const { userId } = requiereUsuario(req);
  const usuario = check(await getDb().from('usuarios').select('racha, ultima_diaria').eq('twitch_id', userId).single());
  return { logros: await evaluarLogros(userId), diaria: estadoDiaria(usuario) };
}

// POST /api/logros/reclamar { logro } — se comprueba en el servidor que está completado
export async function reclamarLogro(req) {
  const { userId } = requiereUsuario(req);
  const id = String(cuerpo(req).logro || '');
  const definicion = LOGROS.find((l) => l.id === id);
  if (!definicion) throw new HttpError(404, 'LOGRO_NO_EXISTE');
  const estado = (await evaluarLogros(userId)).find((l) => l.id === id);
  if (!estado.completado) throw new HttpError(409, 'LOGRO_INCOMPLETO', 'Todavía no has completado este logro');
  const polvo = check(await getDb().rpc('reclamar_logro', { p_usuario: userId, p_logro: id, p_recompensa: definicion.premio }));
  return { premio: definicion.premio, polvo };
}

// POST /api/diaria — recompensa diaria (la racha sube si vienes días seguidos)
export async function diaria(req) {
  const { userId } = requiereUsuario(req);
  const r = check(await getDb().rpc('reclamar_diaria', { p_usuario: userId }))[0];
  return { premio: r.recompensa, racha: r.racha, polvo: r.polvo };
}
