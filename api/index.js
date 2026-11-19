// Único punto de entrada del backend.
// vercel.json redirige /api/<ruta> → /api?ruta=<ruta>, y aquí se reparte.
// (Una sola función = arranques más rápidos y sin el límite de 12 funciones del plan gratuito.)
import { handler, HttpError } from '../lib/http.js';
import * as publico from '../lib/rutas/publico.js';
import * as admin from '../lib/rutas/admin.js';
import * as intercambios from '../lib/rutas/intercambios.js';

const RUTAS = {
  'yo':                { GET: publico.yo },
  'ping':              { GET: publico.ping },
  'ranking':           { GET: publico.ranking },
  'sobres/energia':    { POST: publico.usarEnergia },
  'sobres/abrir':      { POST: publico.abrir },
  'sobres/elegir':     { POST: publico.elegir },
  'alertas':           { GET: publico.alertas },
  'polvo/desmontar':   { POST: publico.desmontar },
  'tienda/comprar':    { POST: publico.comprar },
  'certificar':        { POST: publico.certificar },
  'certificar/recoger': { POST: publico.recogerCertificacion },

  'intercambios':             { GET: intercambios.listar, POST: intercambios.crear },
  'intercambios/responder':   { POST: intercambios.responder },
  'intercambios/preferencia': { POST: intercambios.preferencia },
  'usuarios':                 { GET: intercambios.buscarUsuarios },
  'usuarios/coleccion':       { GET: intercambios.coleccionDe },

  'admin/cartas':      { GET: admin.cartas, POST: admin.cartas, PUT: admin.cartas, DELETE: admin.cartas },
  'admin/tipos-sobre': { GET: admin.tiposSobre, POST: admin.tiposSobre, PUT: admin.tiposSobre, DELETE: admin.tiposSobre },
  'admin/regalar':     { POST: admin.regalar },
  'admin/ajustes':     { GET: admin.ajustes, PUT: admin.ajustes },
  'admin/resumen':     { GET: admin.resumen },
  'admin/simular':     { POST: admin.simular },
  'admin/usuarios':    { GET: admin.usuarios },
  'admin/usuarios/detalle': { GET: admin.usuarioDetalle },
};

export default function router(req, res) {
  const ruta = String(req.query.ruta || '').replace(/^\/+|\/+$/g, '');

  if (ruta === 'arte') return publico.arte(req, res);

  const metodos = RUTAS[ruta];
  return handler(metodos ? Object.keys(metodos) : ['GET'], (req) => {
    if (!metodos) throw new HttpError(404, 'RUTA_NO_ENCONTRADA', `No existe /api/${ruta}`);
    return metodos[req.method](req);
  })(req, res);
}
