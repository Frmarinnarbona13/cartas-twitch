// Utilidades HTTP comunes a todas las funciones de /api

export class HttpError extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje || codigo);
    this.status = status;
    this.codigo = codigo;
  }
}

// Envuelve una función: añade CORS, convierte el resultado en JSON
// y transforma los errores en respuestas { error, mensaje }.
export function handler(metodos, fn) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', [...metodos, 'OPTIONS'].join(', '));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    try {
      if (!metodos.includes(req.method)) {
        throw new HttpError(405, 'METODO_NO_PERMITIDO');
      }
      const resultado = await fn(req, res);
      res.status(200).json(resultado ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({
        error: e instanceof HttpError ? e.codigo : 'ERROR_INTERNO',
        // Los errores internos no se detallan al cliente (quedan en los logs de Vercel)
        mensaje: e instanceof HttpError ? e.message : 'Algo ha fallado en el servidor. Inténtalo de nuevo.',
      });
    }
  };
}

export function cuerpo(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// URL de imagen segura: https, sin comillas, paréntesis ni espacios (evita inyección en CSS/HTML)
export function urlSegura(valor, obligatoria, mensaje = 'La imagen debe ser una URL https:// válida') {
  const texto = String(valor ?? '').trim();
  if (!texto) {
    if (obligatoria) throw new HttpError(400, 'URL_IMAGEN_NO_VALIDA', mensaje);
    return null;
  }
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new HttpError(400, 'URL_IMAGEN_NO_VALIDA', mensaje);
  }
  if (url.protocol !== 'https:' || /["'()<>\\\s`]/.test(texto) || texto.length > 500) {
    throw new HttpError(400, 'URL_IMAGEN_NO_VALIDA', mensaje);
  }
  return texto;
}

// Texto de búsqueda: solo letras, números, guion bajo y espacios
export function textoBusqueda(valor, max = 25) {
  return String(valor ?? '').normalize('NFC').replace(/[^\p{L}\p{N}_ ]/gu, '').trim().slice(0, max);
}
