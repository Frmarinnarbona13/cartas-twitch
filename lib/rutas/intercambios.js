// Intercambios de cartas entre espectadores.
import { cuerpo, HttpError } from '../http.js';
import { requiereUsuario } from '../twitch.js';
import { getDb, check, CAMPOS_CARTA } from '../supabase.js';

const MAX_POR_LADO = 5;
const MAX_ENVIADOS_PENDIENTES = 10;

// Detalle de copias: { id: { numero_serie, carta } }
async function detalleCopias(db, ids) {
  if (!ids.length) return {};
  const copias = check(await db.from('copias').select('id, numero_serie, carta_id, nota').in('id', ids));
  const cartaIds = [...new Set(copias.map((c) => c.carta_id))];
  const cartas = cartaIds.length ? check(await db.from('cartas').select(CAMPOS_CARTA).in('id', cartaIds)) : [];
  const porId = new Map(cartas.map((c) => [c.id, c]));
  return Object.fromEntries(copias.map((c) => [c.id, { numero_serie: c.numero_serie, nota: c.nota, carta: porId.get(c.carta_id) }]));
}

async function nombres(db, ids) {
  if (!ids.length) return {};
  const filas = check(await db.from('usuarios').select('twitch_id, nombre, login').in('twitch_id', ids));
  return Object.fromEntries(filas.map((u) => [u.twitch_id, u.nombre || u.login || 'Anónimo']));
}

// GET /api/intercambios — mis intercambios (pendientes + historial reciente)
export async function listar(req) {
  const { userId } = requiereUsuario(req);
  const db = getDb();
  const campos = 'id, de_usuario, para_usuario, copias_ofrecidas, copias_pedidas, estado, creado_en, resuelto_en';

  const [pendientes, historial, yo] = await Promise.all([
    db.from('intercambios').select(campos).eq('estado', 'pendiente').or(`de_usuario.eq.${userId},para_usuario.eq.${userId}`).order('creado_en', { ascending: false }).then(check),
    db.from('intercambios').select(campos).neq('estado', 'pendiente').or(`de_usuario.eq.${userId},para_usuario.eq.${userId}`).order('resuelto_en', { ascending: false }).limit(15).then(check),
    db.from('usuarios').select('acepta_intercambios').eq('twitch_id', userId).maybeSingle().then(check),
  ]);

  const todos = [...pendientes, ...historial];
  const [copias, gente] = await Promise.all([
    detalleCopias(db, [...new Set(todos.flatMap((t) => [...t.copias_ofrecidas, ...t.copias_pedidas]))]),
    nombres(db, [...new Set(todos.flatMap((t) => [t.de_usuario, t.para_usuario]))]),
  ]);

  const formatear = (t) => {
    const soyEmisor = t.de_usuario === userId;
    return {
      id: t.id,
      estado: t.estado,
      creado_en: t.creado_en,
      resuelto_en: t.resuelto_en,
      enviado_por_mi: soyEmisor,
      otro: gente[soyEmisor ? t.para_usuario : t.de_usuario] || 'Anónimo',
      // Siempre desde MI punto de vista
      doy: (soyEmisor ? t.copias_ofrecidas : t.copias_pedidas).map((id) => ({ id, ...copias[id] })),
      recibo: (soyEmisor ? t.copias_pedidas : t.copias_ofrecidas).map((id) => ({ id, ...copias[id] })),
    };
  };

  return {
    acepta_intercambios: yo?.acepta_intercambios ?? true,
    recibidos: pendientes.filter((t) => t.para_usuario === userId).map(formatear),
    enviados: pendientes.filter((t) => t.de_usuario === userId).map(formatear),
    historial: historial.map(formatear),
  };
}

// GET /api/usuarios?q=texto — buscar a quién proponer un intercambio
export async function buscarUsuarios(req) {
  const { userId } = requiereUsuario(req);
  const q = String(req.query.q || '').trim().replace(/[%,()*]/g, '').slice(0, 25);
  let consulta = getDb()
    .from('usuarios')
    .select('twitch_id, nombre, login')
    .eq('acepta_intercambios', true)
    .neq('twitch_id', userId)
    .not('nombre', 'is', null)
    .order('ultimo_visto', { ascending: false, nullsFirst: false })
    .limit(12);
  if (q) consulta = consulta.or(`nombre.ilike.%${q}%,login.ilike.%${q}%`);
  const filas = check(await consulta);
  return { usuarios: filas.map((u) => ({ id: u.twitch_id, nombre: u.nombre || u.login })) };
}

// GET /api/usuarios/coleccion?id=… — cartas de otro espectador (para pedirle alguna)
export async function coleccionDe(req) {
  requiereUsuario(req);
  const id = String(req.query.id || '');
  const db = getDb();
  const usuario = check(await db.from('usuarios').select('twitch_id, nombre, login, acepta_intercambios').eq('twitch_id', id).maybeSingle());
  if (!usuario) throw new HttpError(404, 'USUARIO_NO_ENCONTRADO', 'Ese espectador no existe');
  if (!usuario.acepta_intercambios) throw new HttpError(403, 'NO_ACEPTA', 'Este espectador no acepta intercambios');
  const copias = check(await db.from('copias').select('id, numero_serie, carta_id').eq('usuario_id', id).order('obtenida_en', { ascending: false }));
  const detalle = await detalleCopias(db, copias.map((c) => c.id));
  return {
    usuario: { id: usuario.twitch_id, nombre: usuario.nombre || usuario.login },
    copias: copias.map((c) => ({ id: c.id, ...detalle[c.id] })),
  };
}

function listaIds(v) {
  const ids = Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
  if (ids.length > MAX_POR_LADO) throw new HttpError(400, 'DEMASIADAS_CARTAS', `Máximo ${MAX_POR_LADO} cartas por lado`);
  return ids;
}

// POST /api/intercambios { para, ofrecidas: [copiaId], pedidas: [copiaId] }
export async function crear(req) {
  const { userId } = requiereUsuario(req);
  const body = cuerpo(req);
  const db = getDb();
  const para = String(body.para || '');
  const ofrecidas = listaIds(body.ofrecidas);
  const pedidas = listaIds(body.pedidas);

  if (para === userId) throw new HttpError(400, 'A_TI_MISMO', 'No puedes intercambiar contigo mismo');
  if (!ofrecidas.length && !pedidas.length) throw new HttpError(400, 'VACIO', 'Elige al menos una carta');

  const destino = check(await db.from('usuarios').select('twitch_id, acepta_intercambios').eq('twitch_id', para).maybeSingle());
  if (!destino) throw new HttpError(404, 'USUARIO_NO_ENCONTRADO', 'Ese espectador no existe');
  if (!destino.acepta_intercambios) throw new HttpError(403, 'NO_ACEPTA', 'Este espectador no acepta intercambios');

  const comprobar = async (ids, dueno, mensaje) => {
    if (!ids.length) return;
    const { count } = await db.from('copias').select('id', { count: 'exact', head: true }).in('id', ids).eq('usuario_id', dueno);
    if (count !== ids.length) throw new HttpError(409, 'CARTAS_NO_VALIDAS', mensaje);
  };
  await comprobar(ofrecidas, userId, 'Alguna de las cartas que ofreces ya no es tuya');
  await comprobar(pedidas, para, 'Alguna de las cartas que pides ya no es de ese espectador');

  const { count: certificando } = await db
    .from('certificaciones')
    .select('id', { count: 'exact', head: true })
    .in('copia_id', [...ofrecidas, ...pedidas])
    .neq('estado', 'recogida');
  if (certificando) throw new HttpError(409, 'EN_CERTIFICACION', 'Alguna de esas cartas se está certificando y no se puede intercambiar');

  const { count: enviados } = await db.from('intercambios').select('id', { count: 'exact', head: true }).eq('de_usuario', userId).eq('estado', 'pendiente');
  if (enviados >= MAX_ENVIADOS_PENDIENTES) {
    throw new HttpError(429, 'DEMASIADOS_PENDIENTES', `Tienes ${enviados} propuestas sin responder. Cancela alguna antes de enviar más.`);
  }

  const nuevo = check(
    await db.from('intercambios').insert({ de_usuario: userId, para_usuario: para, copias_ofrecidas: ofrecidas, copias_pedidas: pedidas }).select('id').single(),
  );
  return { id: nuevo.id };
}

// POST /api/intercambios/responder { id, accion: aceptar | rechazar | cancelar }
export async function responder(req) {
  const { userId } = requiereUsuario(req);
  const body = cuerpo(req);
  const id = Number(body.id);
  const db = getDb();

  if (body.accion === 'aceptar') {
    const t = check(await db.rpc('aceptar_intercambio', { p_id: id, p_usuario: userId }));
    if (t.estado === 'fallido') {
      throw new HttpError(409, 'INTERCAMBIO_FALLIDO', 'Alguna carta ya no está disponible, así que el intercambio se ha anulado');
    }
    return { estado: t.estado };
  }

  const columna = body.accion === 'rechazar' ? 'para_usuario' : body.accion === 'cancelar' ? 'de_usuario' : null;
  if (!columna) throw new HttpError(400, 'ACCION_NO_VALIDA');
  const filas = check(
    await db
      .from('intercambios')
      .update({ estado: body.accion === 'rechazar' ? 'rechazado' : 'cancelado', resuelto_en: new Date().toISOString() })
      .eq('id', id)
      .eq(columna, userId)
      .eq('estado', 'pendiente')
      .select('id'),
  );
  if (!filas.length) throw new HttpError(409, 'INTERCAMBIO_NO_VALIDO', 'Ese intercambio ya no está pendiente');
  return { estado: body.accion === 'rechazar' ? 'rechazado' : 'cancelado' };
}

// POST /api/intercambios/preferencia { acepta: true|false }
export async function preferencia(req) {
  const { userId } = requiereUsuario(req);
  const acepta = Boolean(cuerpo(req).acepta);
  check(await getDb().from('usuarios').update({ acepta_intercambios: acepta }).eq('twitch_id', userId));
  return { acepta_intercambios: acepta };
}
