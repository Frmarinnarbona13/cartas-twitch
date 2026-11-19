# Cartas para Twitch

Extensión privada de Twitch para abrir sobres y coleccionar cartas originales.

## Estructura

```
api/index.js          → única función del backend (reparte /api/<ruta>)
lib/                  → lógica del backend
  http.js               CORS, errores y respuestas JSON
  twitch.js             validación del token de Twitch + API de Twitch
  supabase.js           conexión a la base de datos
  sorteo.js             sorteo de cartas por rareza
  usuarios.js           registro de espectadores conectados
  rutas/publico.js      rutas del espectador (yo, ping, ranking, sobres…)
  rutas/admin.js        rutas del admin (cartas, sobres, drops, ajustes…)
  rutas/intercambios.js intercambios de cartas entre espectadores
ext/                  → frontend de la extensión
  app.html / app.js     vista del espectador (componente de vídeo o panel)
  admin.html / admin.js panel de admin (configuración en Twitch)
  comun.js              conexión con el backend y dibujo de cartas
  apertura.js           animación de apertura de sobres
  estilos.css           estilos compartidos (cartas, sobres, animaciones)
obs/alertas.html      → alertas para OBS (Fuente → Navegador, 800×600)
schema.sql            → primera versión de la base de datos (las ampliaciones posteriores están en Supabase → Database → Migrations)
```

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Dónde se consigue |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API → `service_role` (¡secreta!) |
| `TWITCH_EXTENSION_SECRET` | Consola de Twitch → tu extensión → Extension Settings → Extension Secrets |
| `TWITCH_CLIENT_ID` | Consola de Twitch → tu extensión (arriba, "Client ID") |
| `TWITCH_CLIENT_SECRET` | Consola de Twitch → tu extensión → Extension Settings → Twitch API Client Secret |
| `TWITCH_CHANNEL_ID` | (Opcional) ID numérico de tu canal: solo se aceptarán peticiones de tu canal |

`TWITCH_CLIENT_ID` y `TWITCH_CLIENT_SECRET` son opcionales pero recomendadas: sirven para guardar
los nombres de los espectadores, regalar a usuarios que nunca han abierto la extensión y saber
si el canal está en directo (para la certificación).

## Seguridad

- La base de datos tiene RLS activado sin políticas: solo el backend (clave `service_role`) puede leer o escribir.
- Las funciones SQL que mueven cartas, polvo o energía son atómicas y no se pueden llamar desde fuera.
- Todo lo que da algo (sorteo, energía, logros, recompensa diaria, certificación) se calcula en el servidor.
- El token de Twitch se valida en cada petición; las rutas de admin exigen ser el propietario del canal.
- Los errores internos no se muestran al cliente (quedan en los logs de Vercel).

## Configuración en la consola de Twitch (Asset Hosting)

- **Testing Base URI**: `https://<tu-proyecto>.vercel.app/ext/`
- **Video - Component viewer path**: `app.html`
- **Panel viewer path** (opcional): `app.html`
- **Config path**: `admin.html`
- **Live Config path**: `admin.html`
- **Identity Link**: activado (para saber quién es cada espectador)
- **Allowlist for URL Fetching Domains**: `https://<tu-proyecto>.vercel.app`
- **Allowlist for Image Domains**: `https://<tu-proyecto>.vercel.app` y el de tus imágenes (p. ej. `https://<usuario>.github.io`)
