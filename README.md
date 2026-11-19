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
ext/                  → frontend de la extensión
  app.html / app.js     vista del espectador (componente de vídeo o panel)
  admin.html / admin.js panel de admin (configuración en Twitch)
  comun.js              conexión con el backend y dibujo de cartas
  apertura.js           animación de apertura de sobres
  estilos.css           estilos compartidos (cartas, sobres, animaciones)
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

Las dos últimas son opcionales: sirven para guardar los nombres de los espectadores
y para regalar a usuarios que nunca han abierto la extensión.

## Configuración en la consola de Twitch (Asset Hosting)

- **Testing Base URI**: `https://<tu-proyecto>.vercel.app/ext/`
- **Video - Component viewer path**: `app.html`
- **Panel viewer path** (opcional): `app.html`
- **Config path**: `admin.html`
- **Live Config path**: `admin.html`
- **Identity Link**: activado (para saber quién es cada espectador)
- **Allowlist for URL Fetching Domains**: `https://<tu-proyecto>.vercel.app`
- **Allowlist for Image Domains**: `https://<tu-proyecto>.vercel.app` y el de tus imágenes (p. ej. `https://<usuario>.github.io`)
