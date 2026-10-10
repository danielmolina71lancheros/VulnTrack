# Plan de Implementación — Endurecimiento de Seguridad VulnTrack

Trabajo DIRECTO en `d:\VulnTrack` (sin worktree). Código y comentarios en español.
Convenciones: controladores en `backend/src/controllers`, middlewares en `backend/src/middlewares`,
config en `backend/src/config`, consultas parametrizadas, patrón `queryConRLS` para multi-tenant.

Decisiones de diseño tomadas (grounded en el código leído):

- **Cliente Redis** (`backend/src/config/redis.js`): usar `redis@^4.6.13` (ya en `package.json`), un
  singleton `createClient` con `socket.host = REDIS_HOST` y `password = REDIS_PASSWORD`. Conexión
  perezosa + listeners de error que solo loguean. Exporta helpers `incrementarContador(clave, ttlSeg)`
  y `estaDisponible()`. Rationale: fail-open requiere no lanzar si Redis cae; un singleton evita abrir
  conexiones por request.
- **Rate-limit** como middleware en `backend/src/middlewares/rateLimitLogin.js` (mismo estilo factory
  que `roleMiddleware.js`): clave `login:ip:<ip>` y `login:ipcorreo:<ip>:<correo>`, ventana 15 min
  (900 s), máx. 10 intentos. Si Redis no responde → `next()` (fail-open) logueando el error. Al exceder
  → HTTP 429 en español. Rationale: aislar la lógica del controlador y aplicarla SOLO a `/login`.
- **Auditoría del bloqueo**: `registrarAuditoria` pasa por `queryConRLS`, que exige `id_empresa`; en la
  etapa de rate-limit (pre-login) NO hay tenant autenticado. Decisión: registrar el bloqueo con el
  tenant centinela `'BYPASS'` (ya usado en el login) de forma best-effort, sin bloquear la respuesta 429
  si la auditoría falla (el helper ya traga sus errores). Rationale: mantiene el rastro OWASP A09 sin
  romper fail-open.
- **CORS** (`backend/src/server.js`): leer `CORS_ORIGINS` (CSV) y construir `origin` dinámico; fallback
  dev `http://localhost:5173`, `http://localhost`, `http://localhost:80`. Añadir `app.set('trust proxy', 1)`
  para que `req.ip` sea correcto detrás del frontend. Rationale: cerrar CORS abierto sin romper el proxy
  Vite ni el frontend en :80.

---

- [ ] 1. Crear el cliente Redis reutilizable con degradación elegante (fail-open).
      Singleton `createClient({ socket: { host: process.env.REDIS_HOST || 'securehub-redis' }, password: process.env.REDIS_PASSWORD })`.
      Listener `.on('error', ...)` que SOLO loguea (nunca throw). Export: `getRedis()`, `incrementarContador(clave, ttlSeg)`
      (INCR + EXPIRE la primera vez, devuelve el conteo; si falla lanza para que el llamador decida), `estaDisponible()`.
      Files: `d:\VulnTrack\backend\src\config\redis.js`
      Verify: `cd d:\VulnTrack\backend && node -e "require('./src/config/redis')"` carga sin error de sintaxis;
      `node --check src/config/redis.js` pasa.

- [ ] 2. Crear el middleware de rate-limiting de login respaldado por Redis.
      Factory `limitarLogin({ ventanaSeg = 900, maximo = 10 })` al estilo `roleMiddleware.js`. Deriva `ip = req.ip`
      y `correo = (req.body?.correo || '').toLowerCase()`. Incrementa `login:ip:<ip>` y, si hay correo,
      `login:ipcorreo:<ip>:<correo>`. Si cualquier conteo > maximo → responde 429
      `{ error: "Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos." }` y registra
      auditoría best-effort con tenant `'BYPASS'` (`accion: 'LOGIN_RATE_LIMITED'`, `modulo: 'Seguridad'`,
      `resultado: 'DENEGADO'`, `req.ip`). Si Redis no está disponible o lanza → `console.error` + `next()` (fail-open).
      Files: `d:\VulnTrack\backend\src\middlewares\rateLimitLogin.js`
      Verify: `node --check d:\VulnTrack\backend\src\middlewares\rateLimitLogin.js` pasa.

- [ ] 3. Aplicar el middleware SOLO a la ruta de login.
      Importar `limitarLogin` y anteponerlo en `router.post('/login', limitarLogin(), login)`. No tocar las demás rutas.
      Files: `d:\VulnTrack\backend\src\routes\authRoutes.js`
      Verify: `node --check d:\VulnTrack\backend\src\routes\authRoutes.js` pasa; inspección confirma que solo `/login`
      lleva el middleware.

- [ ] 4. Restringir CORS a orígenes conocidos y habilitar trust proxy.
      Sustituir `app.use(cors())` por una config que lee `CORS_ORIGINS` (CSV → array, trim). Fallback dev:
      `['http://localhost:5173','http://localhost','http://localhost:80']`. `origin` callback que permite
      peticiones sin Origin (curl/health) y rechaza desconocidos. Añadir `app.set('trust proxy', 1)` antes de
      los middlewares para que `req.ip` refleje al cliente real tras el frontend.
      Files: `d:\VulnTrack\backend\src\server.js`
      Verify: `node --check d:\VulnTrack\backend\src\server.js` pasa.

- [ ] 5. Documentar las nuevas variables de entorno en `.env` y `.env.example`.
      `.env`: añadir `REDIS_HOST=securehub-redis` y `CORS_ORIGINS=http://localhost:5173,http://localhost`.
      `.env.example`: añadir `REDIS_HOST=securehub-redis`, `CORS_ORIGINS=http://localhost:5173,http://localhost`
      con comentarios en español. No duplicar claves existentes.
      Files: `d:\VulnTrack\.env`, `d:\VulnTrack\.env.example`
      Verify: `node -e "require('dotenv')"` no aplica (no hay dotenv); comprobar que las claves existen y no se
      duplican con una lectura del archivo.

- [ ] 6. Inyectar `CORS_ORIGINS` al servicio `securehub-api` en docker-compose.
      Añadir `CORS_ORIGINS: ${CORS_ORIGINS}` al bloque `environment` de `securehub-api` (REDIS_HOST ya está).
      Files: `d:\VulnTrack\docker-compose.yml`
      Verify: `docker compose config` válido; si docker no está disponible, validar el YAML con
      `node -e "const yaml=0" ` → en su defecto validación estructural y revisión manual del indentado.

- [ ] 7. Añadir healthchecks y arranque ordenado en docker-compose.
      `securehub-db`: `healthcheck` con `pg_isready -U ${DB_USER} -d ${DB_NAME}` (interval 10s, timeout 5s,
      retries 5). `securehub-redis`: `healthcheck` con `redis-cli -a ${REDIS_PASSWORD} ping` esperando `PONG`.
      Cambiar `depends_on` de `securehub-api` a la forma larga: `securehub-db: condition: service_healthy`
      y `securehub-redis: condition: service_healthy`.
      Files: `d:\VulnTrack\docker-compose.yml`
      Verify: `docker compose config` válido (o validación YAML + revisión si docker ausente); confirmar que
      la forma larga de `depends_on` quedó bien anidada.

- [ ] 8. Alinear el README con la arquitectura real del compose.
      Corregir tabla de stack/puertos (frontend en :80 directo, API en :3000, PostgreSQL 18 no 16); reescribir
      el rol de Nginx (`securehub-files`): SOLO sirve evidencias estáticas, NO es reverse proxy que termina TLS
      ni enruta la API. Añadir el servicio `securehub-scanner`. Reescribir el diagrama mermaid para reflejar
      servicios reales (`securehub-db/redis/files/scanner/api/frontend`) sin inventar TLS/reverse-proxy.
      Documentar `/health` → servicio `SecureHub API`. Añadir `DB_APP_USER`, `DB_APP_PASSWORD`, `CORS_ORIGINS`,
      `REDIS_HOST` a la sección Variables de Entorno. Corregir el paso de despliegue para mencionar el
      `.env.example` real en la raíz. NO inventar componentes inexistentes.
      Files: `d:\VulnTrack\README.md`
      Verify: lectura del README confirma que no quedan referencias a 'api'/'db' como nombres de servicio ni a
      Nginx como reverse proxy TLS; las 4 variables nuevas aparecen en la tabla de entorno.
