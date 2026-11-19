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
        mensaje: e.message,
      });
    }
  };
}

export function cuerpo(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}
