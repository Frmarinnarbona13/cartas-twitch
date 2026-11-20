import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

let cliente = null;

// Cliente con la clave service_role: solo existe en el servidor.
export function getDb() {
  if (!cliente) {
    const url = process.env.SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !clave) {
      throw new HttpError(500, 'CONFIG_INCOMPLETA', 'Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en Vercel');
    }
    cliente = createClient(url, clave, { auth: { persistSession: false } });
  }
  return cliente;
}

// Errores que lanzan nuestras funciones SQL (raise exception '...')
const ERRORES_CONOCIDOS = {
  SOBRE_NO_VALIDO: [400, 'Ese sobre ya no se puede abrir'],
  POSICION_NO_VALIDA: [400, 'Posición no válida'],
  SIN_CARTAS_DISPONIBLES: [409, 'No hay cartas disponibles para este sobre'],
  SIN_ENERGIA: [409, 'No te queda energía. Espera a que se recargue'],
  SOBRE_NO_DISPONIBLE: [400, 'Ese sobre no está disponible'],
  USUARIO_NO_REGISTRADO: [400, 'Usuario no registrado'],
  INTERCAMBIO_NO_VALIDO: [409, 'Ese intercambio ya no está pendiente'],
  SELECCION_NO_VALIDA: [400, 'Elige al menos una carta'],
  CARTAS_NO_VALIDAS: [409, 'Alguna de esas cartas ya no es tuya'],
  POLVO_INSUFICIENTE: [409, 'No tienes suficiente polvo'],
  YA_CERTIFICADA: [409, 'Esa carta ya está certificada'],
  YA_EN_CERTIFICACION: [409, 'Esa carta ya se está certificando'],
  MAX_CERTIFICACIONES: [409, 'Ya tienes el máximo de cartas certificándose a la vez'],
  EN_CERTIFICACION: [409, 'Alguna carta se está certificando y no se puede usar ahora'],
  CERTIFICACION_NO_LISTA: [409, 'Esa certificación aún no está lista'],
  YA_RECLAMADA: [409, 'Ya has reclamado la recompensa de hoy. ¡Vuelve mañana!'],
  YA_RECLAMADO: [409, 'Ya has reclamado este logro'],
};

// Devuelve data o lanza un error legible.
export function check({ data, error }) {
  if (error) {
    const codigo = Object.keys(ERRORES_CONOCIDOS).find((c) => error.message?.includes(c));
    if (codigo) throw new HttpError(ERRORES_CONOCIDOS[codigo][0], codigo, ERRORES_CONOCIDOS[codigo][1]);
    if (error.code === '23514') throw new HttpError(400, 'DATOS_NO_VALIDOS', error.message);
    if (error.code === '23505') throw new HttpError(409, 'DUPLICADO', error.message);
    throw new Error(`Supabase: ${error.message}`);
  }
  return data;
}

export const CAMPOS_CARTA =
  'id, nombre, descripcion, frase, artista, coste, grupo, imagen_url, rareza, limite_copias, copias_emitidas, activa, diseno, efecto, efecto_modo';

// Cartas que pueden salir en un sobre: activas, con stock y del grupo del sobre.
export async function cartasDisponibles(db, grupos) {
  const cartas = check(await db.from('cartas').select(CAMPOS_CARTA).eq('activa', true));
  const filtrarGrupo = Array.isArray(grupos) && grupos.length > 0;
  return cartas.filter(
    (c) =>
      (c.limite_copias === null || c.copias_emitidas < c.limite_copias) &&
      (!filtrarGrupo || grupos.includes(c.grupo)),
  );
}
