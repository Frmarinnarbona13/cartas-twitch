import jwt from 'jsonwebtoken';
import { HttpError } from './http.js';

// ---------------------------------------------------------------
// Validar el token (JWT) que Twitch da al frontend de la extensión
// ---------------------------------------------------------------
export function autenticar(req) {
  const secreto = process.env.TWITCH_EXTENSION_SECRET;
  if (!secreto) throw new HttpError(500, 'CONFIG_INCOMPLETA', 'Falta TWITCH_EXTENSION_SECRET en Vercel');

  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) throw new HttpError(401, 'SIN_TOKEN');

  let datos;
  try {
    datos = jwt.verify(token, Buffer.from(secreto, 'base64'), { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'TOKEN_NO_VALIDO');
  }

  // Si se configura TWITCH_CHANNEL_ID, solo se aceptan tokens de ese canal
  const canalPermitido = process.env.TWITCH_CHANNEL_ID;
  if (canalPermitido && String(datos.channel_id) !== String(canalPermitido)) {
    throw new HttpError(403, 'CANAL_NO_PERMITIDO');
  }

  return {
    userId: datos.user_id || null,      // solo si el espectador compartió su identidad
    opaqueId: datos.opaque_user_id,
    rol: datos.role,                    // broadcaster | moderator | viewer | external
    canalId: datos.channel_id,
  };
}

export function requiereUsuario(req) {
  const auth = autenticar(req);
  if (!auth.userId) throw new HttpError(403, 'IDENTIDAD_NO_COMPARTIDA');
  return auth;
}

export function requiereAdmin(req) {
  const auth = autenticar(req);
  if (auth.rol !== 'broadcaster') throw new HttpError(403, 'SOLO_ADMIN');
  return auth;
}

// ---------------------------------------------------------------
// API de Twitch (Helix) para obtener nombres de usuario.
// Usa TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET. Si faltan, se omite.
// ---------------------------------------------------------------
let tokenApp = null;
let caducaEn = 0;

async function tokenAplicacion() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secreto = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secreto) return null;
  if (tokenApp && Date.now() < caducaEn) return tokenApp;

  const r = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: id, client_secret: secreto, grant_type: 'client_credentials' }),
  });
  if (!r.ok) {
    console.error('No se pudo obtener token de Twitch', r.status, await r.text());
    return null;
  }
  const d = await r.json();
  tokenApp = d.access_token;
  caducaEn = Date.now() + (d.expires_in - 60) * 1000;
  return tokenApp;
}

// Busca un usuario por id o por login. Devuelve { id, login, nombre } o null.
export async function buscarUsuarioTwitch({ id, login }) {
  const token = await tokenAplicacion();
  if (!token) return null;

  const filtro = id ? `id=${encodeURIComponent(id)}` : `login=${encodeURIComponent(login)}`;
  const r = await fetch(`https://api.twitch.tv/helix/users?${filtro}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;

  const usuario = (await r.json()).data?.[0];
  return usuario ? { id: usuario.id, login: usuario.login, nombre: usuario.display_name } : null;
}

export function twitchApiConfigurada() {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

// ¿Está el canal en directo ahora? (se consulta a Twitch como mucho 1 vez por minuto)
// Sin TWITCH_CLIENT_SECRET no se puede saber: se asume que sí.
const cacheDirecto = new Map();
export async function canalEnDirecto(canalId) {
  if (!canalId) return true;
  const guardado = cacheDirecto.get(canalId);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;

  let valor = true;
  const token = await tokenAplicacion();
  if (token) {
    try {
      const r = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(canalId)}`, {
        headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
      });
      if (r.ok) valor = ((await r.json()).data || []).length > 0;
    } catch (e) {
      console.warn('No se pudo consultar si el canal está en directo', e);
    }
  }
  cacheDirecto.set(canalId, { valor, hasta: Date.now() + 60 * 1000 });
  return valor;
}
