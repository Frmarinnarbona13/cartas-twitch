// Eventos en directo y garantía de sobres.
import { check } from './supabase.js';

export const EVENTOS = {
  suerte: 'Hora de la suerte: épicas o mejores ×2',
  polvo_doble: 'Polvo doble al desmontar',
  energia_rapida: 'Energía rápida: se recarga el doble de rápido',
};

// Evento activo ahora mismo (o null)
export async function eventoActivo(db) {
  const a = check(await db.from('ajustes').select('evento_tipo, evento_hasta').eq('id', 1).single());
  if (!a.evento_tipo || !a.evento_hasta || new Date(a.evento_hasta) <= new Date()) return null;
  return { tipo: a.evento_tipo, hasta: a.evento_hasta, texto: EVENTOS[a.evento_tipo] };
}

// Con "suerte", las rarezas altas pesan el doble
export function aplicarSuerte(probabilidades, evento) {
  if (evento?.tipo !== 'suerte') return probabilidades;
  const p = { ...probabilidades };
  for (const r of ['epica', 'legendaria', 'divina']) p[r] = Number(p[r] || 0) * 2;
  return p;
}

const BUENAS = new Set(['epica', 'legendaria', 'divina']);

// Sobres seguidos (los más recientes) de cada tipo en los que el usuario se quedó una carta común o rara
export async function rachasSinEpica(db, userId, tipoIds) {
  const rachas = Object.fromEntries(tipoIds.map((id) => [id, 0]));
  if (!tipoIds.length) return rachas;
  const sobres = check(
    await db
      .from('sobres')
      .select('tipo_sobre_id, rareza_obtenida')
      .eq('usuario_id', userId)
      .eq('estado', 'abierto')
      .in('tipo_sobre_id', tipoIds)
      .order('abierto_en', { ascending: false })
      .limit(500),
  );
  const cortada = new Set();
  for (const s of sobres) {
    if (cortada.has(s.tipo_sobre_id)) continue;
    if (BUENAS.has(s.rareza_obtenida)) cortada.add(s.tipo_sobre_id);
    else rachas[s.tipo_sobre_id]++;
  }
  return rachas;
}

// ¿Cuántos sobres faltan para el garantizado? (0 = el próximo es garantizado)
export function faltanParaGarantia(tipo, racha) {
  if (!tipo.garantia_cada) return null;
  return Math.max(0, tipo.garantia_cada - 1 - racha);
}

// Probabilidades de un sobre garantizado: solo épicas o mejores
export function soloBuenas(probabilidades) {
  return { comun: 0, rara: 0, epica: Number(probabilidades.epica) || 1, legendaria: Number(probabilidades.legendaria) || 0, divina: Number(probabilidades.divina) || 0 };
}
