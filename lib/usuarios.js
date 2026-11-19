import { getDb, check } from './supabase.js';
import { buscarUsuarioTwitch } from './twitch.js';

// Registra que el usuario está conectado ahora mismo y, la primera vez,
// guarda su nombre de Twitch. Se usa para los drops aleatorios.
// Devuelve { twitch_id, nombre, login }.
export async function registrarVisita(userId) {
  const db = getDb();
  const existente = check(
    await db.from('usuarios').select('twitch_id, nombre, login').eq('twitch_id', userId).maybeSingle(),
  );

  const fila = { twitch_id: userId, ultimo_visto: new Date().toISOString() };
  if (!existente?.nombre) {
    const info = await buscarUsuarioTwitch({ id: userId });
    if (info) {
      fila.login = info.login;
      fila.nombre = info.nombre;
    }
  }

  check(await db.from('usuarios').upsert(fila, { onConflict: 'twitch_id' }));
  return { twitch_id: userId, nombre: fila.nombre || existente?.nombre || null, login: fila.login || existente?.login || null };
}
