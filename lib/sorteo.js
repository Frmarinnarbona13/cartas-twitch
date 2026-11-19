import { HttpError } from './http.js';

export const RAREZAS = ['comun', 'rara', 'epica', 'legendaria', 'divina'];

// Sortea `cantidad` cartas según los porcentajes por rareza.
//
// - cartasDisponibles: cartas activas y con stock [{ id, rareza }]
// - probabilidades: { comun: 60, rara: 25, ... }
//
// Si una rareza no tiene cartas disponibles, su porcentaje se
// reparte entre las demás (proporcionalmente).
// Dentro de un mismo sobre intenta no repetir carta.
export function sortearCartas(cartasDisponibles, probabilidades, cantidad, aleatorio = Math.random) {
  const porRareza = {};
  for (const carta of cartasDisponibles) {
    (porRareza[carta.rareza] ||= []).push(carta);
  }

  const rarezas = Object.keys(probabilidades).filter(
    (r) => Number(probabilidades[r]) > 0 && porRareza[r]?.length,
  );
  if (rarezas.length === 0) {
    throw new HttpError(409, 'SIN_CARTAS_DISPONIBLES', 'No hay cartas activas con stock para este sobre');
  }

  const total = rarezas.reduce((suma, r) => suma + Number(probabilidades[r]), 0);
  const elegidas = [];

  for (let i = 0; i < cantidad; i++) {
    // 1) Tirar la rareza
    let tirada = aleatorio() * total;
    let rareza = rarezas[rarezas.length - 1];
    for (const r of rarezas) {
      const peso = Number(probabilidades[r]);
      if (tirada < peso) {
        rareza = r;
        break;
      }
      tirada -= peso;
    }

    // 2) Elegir carta de esa rareza (evitando repetir si se puede)
    const opciones = porRareza[rareza];
    const sinRepetir = opciones.filter((c) => !elegidas.includes(c.id));
    const bolsa = sinRepetir.length ? sinRepetir : opciones;
    elegidas.push(bolsa[Math.floor(aleatorio() * bolsa.length)].id);
  }

  return elegidas;
}

// Probabilidad real de cada rareza (tras repartir las que no tienen cartas).
export function probabilidadesReales(cartasDisponibles, probabilidades) {
  const conCartas = new Set(cartasDisponibles.map((c) => c.rareza));
  const validas = RAREZAS.filter((r) => conCartas.has(r) && Number(probabilidades?.[r]) > 0);
  const total = validas.reduce((s, r) => s + Number(probabilidades[r]), 0);
  const reales = {};
  for (const r of RAREZAS) reales[r] = validas.includes(r) && total > 0 ? (Number(probabilidades[r]) / total) * 100 : 0;
  const sinCartas = RAREZAS.filter((r) => Number(probabilidades?.[r]) > 0 && !conCartas.has(r));
  return { reales, sinCartas };
}
