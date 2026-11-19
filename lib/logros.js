// Logros: se calculan a partir de lo que ya hay en la base de datos.
// Cada uno da una recompensa de polvo que se reclama una sola vez.
import { getDb, check } from './supabase.js';

const tiene = (p, rareza) => (p.rarezas || []).includes(rareza) ? 1 : 0;
const pctAlbum = (p) => (p.total_activas ? Math.min(100, Math.floor((p.distintas / p.total_activas) * 100)) : 0);

export const LOGROS = [
  { id: 'primer_sobre', nombre: 'Primer sobre', desc: 'Abre tu primer sobre', premio: 20, medir: (p) => [p.sobres_abiertos, 1] },
  { id: 'sobres_25', nombre: 'Adicto a los sobres', desc: 'Abre 25 sobres', premio: 100, medir: (p) => [p.sobres_abiertos, 25] },
  { id: 'sobres_100', nombre: 'Rasgador profesional', desc: 'Abre 100 sobres', premio: 400, medir: (p) => [p.sobres_abiertos, 100] },
  { id: 'distintas_10', nombre: 'Coleccionista', desc: 'Ten 10 cartas distintas', premio: 50, medir: (p) => [p.distintas, 10] },
  { id: 'distintas_30', nombre: 'Gran coleccionista', desc: 'Ten 30 cartas distintas', premio: 200, medir: (p) => [p.distintas, 30] },
  { id: 'album_50', nombre: 'Medio álbum', desc: 'Completa el 50% del álbum', premio: 250, medir: (p) => [pctAlbum(p), 50] },
  { id: 'album_100', nombre: 'Álbum completo', desc: 'Ten todas las cartas activas', premio: 1500, medir: (p) => [pctAlbum(p), 100] },
  { id: 'primera_epica', nombre: 'Algo especial', desc: 'Consigue una carta épica', premio: 30, medir: (p) => [tiene(p, 'epica'), 1] },
  { id: 'primera_legendaria', nombre: 'Leyenda', desc: 'Consigue una carta legendaria', premio: 100, medir: (p) => [tiene(p, 'legendaria'), 1] },
  { id: 'primera_divina', nombre: 'Tocado por los dioses', desc: 'Consigue una carta divina', premio: 500, medir: (p) => [tiene(p, 'divina'), 1] },
  { id: 'grupo_completo', nombre: 'Set completo', desc: 'Completa todas las cartas de un grupo', premio: 200, medir: (p) => [p.grupos_completos, 1] },
  { id: 'primer_intercambio', nombre: 'Trato hecho', desc: 'Completa un intercambio', premio: 30, medir: (p) => [p.intercambios, 1] },
  { id: 'primera_cert', nombre: 'Sello de calidad', desc: 'Recoge tu primera carta certificada', premio: 20, medir: (p) => [p.certificadas, 1] },
  { id: 'nota_10', nombre: 'Perfección', desc: 'Consigue una certificación de 10', premio: 300, medir: (p) => [p.mejor_nota >= 10 ? 1 : 0, 1] },
];

export async function evaluarLogros(userId) {
  const p = check(await getDb().rpc('progreso_logros', { p_usuario: userId }));
  const reclamados = new Set(p.reclamados || []);
  return LOGROS.map((l) => {
    const [actual, objetivo] = l.medir(p);
    return {
      id: l.id,
      nombre: l.nombre,
      desc: l.desc,
      premio: l.premio,
      actual: Math.min(Number(actual) || 0, objetivo),
      objetivo,
      completado: Number(actual) >= objetivo,
      reclamado: reclamados.has(l.id),
    };
  });
}

// Fecha de hoy y de ayer en España (AAAA-MM-DD)
export function hoyEspana(desplazamientoDias = 0) {
  const d = new Date(Date.now() + desplazamientoDias * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

export function estadoDiaria(usuario) {
  const ultima = usuario.ultima_diaria;
  const disponible = ultima !== hoyEspana();
  const continua = ultima === hoyEspana(-1);
  const rachaActual = ultima === hoyEspana() || continua ? usuario.racha : 0;
  const siguiente = disponible ? Math.min((continua ? usuario.racha : 0) + 1, 7) : null;
  return {
    disponible,
    racha: rachaActual,
    siguiente_dia: siguiente,
    premio: siguiente ? 10 + 5 * (siguiente - 1) : null,
  };
}
