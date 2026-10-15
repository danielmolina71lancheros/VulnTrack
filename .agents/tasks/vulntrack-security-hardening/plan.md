# Plan de implementación — SecureHub (endurecimiento UX/calidad del frontend)

Proyecto: `d:\VulnTrack\frontend` (React 19 + Vite 5 + Tailwind CSS 4 + lucide-react + recharts).
Todo el trabajo se hace directamente en `d:\VulnTrack` sobre la rama principal `main`, SIN worktree. Textos y comentarios en español.

Verificación del proyecto (ejecutar en `d:\VulnTrack\frontend`):
- `npm install` (solo si faltan dependencias / primera vez).
- `npm run build` (vite build) — debe terminar sin errores.
- `npm run lint` (oxlint, config `d:\VulnTrack\frontend\.oxlintrc.json`) — sin errores nuevos.
- No hay suite de tests. La verificación de dark mode/paleta/permisos es por inspección de JSX + grep.

Las cuatro fases son ESTRICTAMENTE SECUENCIALES (1 → 2 → 3 → 4): 1 y 2 son bajo riesgo/alto impacto visible; 3 y 4 son estructurales. No cambiar la clave de localStorage `vulntrack_token` ni las rutas `/api`. No tocar backend salvo para LEER (ya hecho en esta planeación).

Decisiones de diseño tomadas durante la exploración:
- `index.css` ya define los tokens de marca teal (`--color-brand-primary:#0fa3b1`, `--color-brand-secondary:#2a9d8f`, `--color-brand-dark:#264653`, `--color-brand-light:#f9f7f3`, `--color-brand-accent:#b5e2fa`) y `@custom-variant dark (&:is(.dark *))`. El dark mode se activa con la clase `dark` en `document.documentElement` (toggle en `Dashboard.jsx`). Por tanto las correcciones de dark deben usar variantes `dark:hover:`/`dark:focus:`.
- Marca visible = "SecureHub" (decisión firme del usuario). `App.jsx` (login) y `Dashboard.jsx` (sidebar) ya dicen "SecureHub"; el resto hay que revisarlo.
- Para unificar la paleta: color de MARCA → tokens teal `brand-*`; color de DATO/severidad (críticas rojo, altas naranja, medias amarillo, bajas azul; SLA verde/ámbar/rojo; charts recharts; badges de estado) → NO se toca.
- Phase 4: el backend `autorizarRoles(...)` (ver `backend/src/middlewares/roleMiddleware.js`) concede acceso si `rol === 'ADMINISTRADOR'` o `permisos.includes('ALL')`, o si para algún permiso requerido `p` se cumple `rol === p || permisos.includes(p)`. El helper `tienePermiso` del frontend debe replicar EXACTAMENTE esa lógica, y los permisos a comprobar deben ser los MISMOS strings que el backend pasa a `autorizarRoles` (ver tabla en Fase 4), no los labels del catálogo de la UI.

---

## FASE 1 — Arreglar el dark mode roto

Patrón mal formado: una variante `dark:bg-...` quedó "huérfana" junto a `hover:`/`focus:` sin su propia variante `dark:hover:`/`dark:focus:`, de modo que el fondo dark se aplica SIEMPRE (pisa el fondo base), ignorando el estado hover/focus. Corrección: dar al estado su variante dark propia y, cuando el `hover:bg-white` original no tenga sentido en claro, ajustar el tono para que el hover sea sutil en ambos modos.

Ocurrencias localizadas por grep (`hover:bg-... dark:bg-` / `focus:bg-... dark:bg-`), a corregir:

- `src/App.jsx`
  - Líneas 119, 131, 165: inputs del login con `bg-white dark:bg-gray-800/5`. Aquí el panel de login es oscuro (`bg-brand-dark`): el `bg-white` base es incorrecto para ese fondo. Corregir a un fondo coherente de input oscuro, p. ej. `bg-white/5 dark:bg-white/5` o `bg-gray-800/40` (fondo semitransparente sobre el panel oscuro); eliminar el `dark:bg-gray-800/5` huérfano. (Este archivo también se toca en Fase 2 por los azules; coordinar.)
- `src/Dashboard.jsx`
  - Líneas 173 y 189 (botones de nav y Configuración): `text-gray-400 hover:bg-white dark:bg-gray-800/5 hover:text-gray-200` → el sidebar es oscuro (`bg-brand-dark`); usar `hover:bg-white/5 hover:text-gray-200` (quitar el `dark:bg-gray-800/5` huérfano; el hover sutil funciona en ambos modos sobre fondo oscuro).
  - Línea 200 (tarjeta "Sistema activo"): `bg-white dark:bg-gray-800/5 ... hover:bg-white dark:bg-gray-800/10` → `bg-white/5 hover:bg-white/10` (sidebar oscuro; quitar huérfanos).
  - Línea 238 (buscador del header): `... focus:bg-white dark:bg-gray-800 ...` → `focus:bg-white dark:focus:bg-gray-800`.
  - Línea 267 (item de notificación): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
- `src/views/ActivosView.jsx`
  - Línea 230 (buscador): `... focus:bg-white dark:bg-gray-800 ...` → `focus:bg-white dark:focus:bg-gray-800`.
  - Línea 235 (botón "Filtros avanzados"): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
  - Línea 424 (botón Cancelar del modal): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
  - Línea 449 (botón cerrar detalle): `hover:bg-gray-100 dark:bg-gray-700` → `hover:bg-gray-100 dark:hover:bg-gray-700`.
- `src/views/VulnerabilidadesView.jsx`
  - Línea 408 (Cancelar modal): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
  - Línea 433 (cerrar detalle): `hover:bg-gray-100 dark:bg-gray-700` → `hover:bg-gray-100 dark:hover:bg-gray-700`.
- `src/views/RemediacionesView.jsx`
  - Línea 454 (Cancelar modal): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
- `src/views/RolesPermisosView.jsx`
  - Línea 204 (label permiso): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
  - Línea 220 (Cancelar modal): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
- `src/views/UsuariosView.jsx`
  - Línea 162 (fila tabla `<tr>`): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
  - Líneas 233 y 259 (Cancelar modales): `hover:bg-gray-100 dark:bg-gray-700` → `hover:bg-gray-100 dark:hover:bg-gray-700`.
- `src/views/EvidenciasView.jsx`
  - Línea 282 (`<tr>`): `hover:bg-brand-light dark:bg-gray-900/50` → `hover:bg-brand-light dark:hover:bg-gray-900/50`.
- `src/views/ReportesView.jsx`
  - Línea 252 (`<tr>`): `hover:bg-brand-light dark:bg-gray-900` → `hover:bg-brand-light dark:hover:bg-gray-900`.
- `src/views/RiesgosView.jsx`
  - Línea 270 (`<tr>`): `hover:bg-brand-light dark:bg-gray-900/50` → `hover:bg-brand-light dark:hover:bg-gray-900/50`.
- `src/views/ImportacionView.jsx`
  - Línea 144 (dropzone `<label>`): `... bg-brand-light dark:bg-gray-900 hover:bg-gray-100 dark:bg-gray-700` → el estado base `dark:bg-gray-900` SÍ es válido; corregir solo el hover huérfano: `... hover:bg-gray-100 dark:hover:bg-gray-700`.

Nota de distinción: estados BASE legítimos (`bg-white dark:bg-gray-800`, `bg-brand-light dark:bg-gray-900` sin `hover:`/`focus:` delante) NO se tocan; solo se corrige cuando el `dark:bg-...` sigue a un `hover:`/`focus:`.

Verificación Fase 1:
- `cd d:\VulnTrack\frontend; npm run build` termina sin errores.
- `npm run lint` sin errores nuevos.
- Grep de control debe quedar VACÍO para patrones huérfanos de hover/focus: buscar `hover:bg-[^ ]* dark:bg-` y `focus:bg-[^ ]* dark:bg-` en `src/**/*.jsx` y confirmar que todas las coincidencias restantes son estados BASE legítimos (no `hover:`/`focus:` seguidos de `dark:bg-` sin su propia variante). En concreto NO deben quedar `hover:bg-white dark:bg-`, `focus:bg-white dark:bg-`, `hover:bg-brand-light dark:bg-`, `hover:bg-gray-100 dark:bg-gray-`.

---

## FASE 2 — Unificar marca a "SecureHub" y paleta teal

Marca visible:
- `frontend/index.html`: `<title>frontend</title>` → `<title>SecureHub</title>`.
- `src/App.jsx`: confirmar "SecureHub" en el logo del login (ya está). Revisar subtítulos.
- `src/Dashboard.jsx`: confirmar "SecureHub" en el sidebar (ya está).
- Grep `VulnTrack` en `src/**/*.{jsx,js}` y en textos visibles: cambiar a "SecureHub" SOLO en texto visible al usuario. NO cambiar: `vulntrack_token` (clave localStorage), rutas `/api`, ni el nombre de descarga `VulnTrack_Carga_Masiva.xlsx` si se decide conservarlo como nombre de archivo técnico (criterio: es un nombre de archivo generado; preferible renombrar a `SecureHub_Carga_Masiva.xlsx` por coherencia de marca visible, pero NO afecta rutas). Decisión: renombrar ese `a.download` a `SecureHub_Carga_Masiva.xlsx` (es texto visible en el diálogo de descarga).

Paleta — reemplazar azules de MARCA por tokens teal. Ocurrencias de marca a convertir (grep `blue-\d|cyan-\d|purple-\d`):
- `src/App.jsx`:
  - Inputs login `focus:border-blue-500 focus:ring-blue-500` → `focus:border-brand-primary focus:ring-brand-primary` (líneas 119, 131, 165 — la 165 solo `focus:border-blue-500`).
  - Enlace "¿Olvidaste tu contraseña?" `hover:text-blue-300` → `hover:text-brand-accent` o `hover:text-white` (acento de marca). (Línea 152.)
  - Botón submit `from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600` → `from-brand-primary to-brand-secondary hover:from-brand-secondary hover:to-brand-primary` (línea 182).
  - Panel decorativo (líneas 196-210): `bg-purple-500/20` (glow), `border-blue-500/30`, `border-cyan-400/50`, `from-blue-500/10 to-cyan-400/10`, `text-cyan-400`, `bg-cyan-400` → unificar a tonos de marca (`brand-primary`/`brand-accent`); el gradiente `from-[#0B132B] via-[#1C2541]` de fondo es decorativo oscuro, puede conservarse. Mantener el aspecto "glow" pero con teal.
- `src/Dashboard.jsx`:
  - `shadow-blue-600/20` (línea 173) → `shadow-brand-primary/20`.
  - Buscador `focus:border-blue-400` (línea 238) → `focus:border-brand-primary`.
  - Avatar `from-blue-500 to-cyan-500` (línea 280) → `from-brand-primary to-brand-secondary`.
  - Modal MFA input `focus:border-blue-500` (línea 340) → `focus:border-brand-primary`.
  - `disabled:bg-blue-300` (línea 352) → `disabled:bg-brand-primary/40` o `disabled:opacity-50` (tono de marca atenuado).
- Resto de vistas (grep por archivo): reemplazar `focus:ring-blue-500`, `focus:border-blue-500`, `focus:ring-blue-400`, `border-blue-600` (tab activa en `ActivosView` línea 216), `hover:bg-blue-50/50` (fila ActivosView línea 260), `bg-blue-50 border-blue-300`/`hover:border-blue-300` (selección en `RemediacionesView` línea 429), `focus:ring-blue-500` (checkbox) por sus equivalentes `brand-primary`/`brand-secondary`/`brand-accent`.
  - En `ActivosView.jsx` la tab activa usa `text-brand-primary border-blue-600` → `text-brand-primary border-brand-primary`.
  - `bg-blue-100` usado como contenedor de icono (ActivosView línea 190, ImportacionView línea 97) → `bg-brand-accent/30` o `bg-brand-primary/10` (acento de marca, no dato).

NO TOCAR (color de DATO/severidad):
- `ActivosView` `getSeverityColor`: `BAJA → bg-blue-100 text-blue-800 border-blue-200` (línea 152) es SEVERIDAD (dato), se conserva. Igual críticas rojo / altas naranja / medias amarillo.
- `ResumenDashboard`: color `#3B82F6` de la categoría "Baja" y colores de charts recharts.
- Matriz de riesgos `RiesgosView` (`bg-red-600`/`bg-orange-500`/`bg-yellow-500`/`bg-green-500`) y badges de estado/criticidad en todas las vistas.
- Iconos de tipo de activo con color semántico (`text-purple-500` Servidor, `text-green-500` Equipo, etc.) — son categorización de dato, no marca. (Criterio: dejar como están salvo que el usuario pida lo contrario.)

Verificación Fase 2:
- `npm run build` y `npm run lint` sin errores.
- Grep `VulnTrack` en `src/**/*.{jsx,js}` → solo deben quedar `vulntrack_token` y comentarios/rutas internas; ningún texto VISIBLE con "VulnTrack".
- `index.html` tiene `<title>SecureHub</title>`.
- Grep `blue-\d|cyan-\d|purple-` → las coincidencias restantes deben ser únicamente colores de DATO/severidad listados arriba; ningún azul de marca (botones de acción, focus ring genérico, gradiente de login, acentos).

---

## FASE 3 — Cliente API central (`apiClient`) y refactor de vistas

Crear `src/utils/apiClient.js` con helpers y manejo central de 401. Patrón actual en todas las vistas: leen `localStorage.getItem('vulntrack_token')`, arman `Authorization: Bearer`, hacen `fetch`, parsean JSON y `console.error` en catch; sin manejo unificado de 401. Las rutas se pasan absolutas (`'/api/activos'`).

Diseño de `apiClient.js`:
- Exporta `apiGet(path)`, `apiPost(path, body)`, `apiPut(path, body)`, `apiPatch(path, body)`, `apiDelete(path)`, `apiUpload(path, formData)` y `apiGetBlob(path)` (para descargas de `ImportacionView`/`ReportesView`).
- `request(path, { method, body, isForm })`: lee el token y añade `Authorization: Bearer <token>` si existe. Para JSON pone `Content-Type: application/json` y serializa; para FormData NO fija `Content-Type` (el navegador pone el boundary).
- Acepta rutas que ya empiezan con `/api` (las usa tal cual); si no empiezan con `/`, prefija `/api/`. Mantener coherencia con el uso actual (rutas absolutas `/api/...`).
- Manejo central de 401: al recibir 401, limpiar `localStorage.removeItem('vulntrack_token')` y forzar relogin. Mecanismo elegido: `window.dispatchEvent(new Event('auth:logout'))` + `App.jsx` escucha ese evento y resetea su estado a login (más limpio que `window.location`, respeta el estado React de `App.jsx` que decide login/dashboard por presencia de token). Documentar en comentario. (Fallback si el listener no está montado: `window.location.reload()` tras limpiar token.)
- Devuelve el JSON parseado en éxito. En error (no-ok y no-401), lanza un `Error` cuyo `message` es `data.error` del backend (campo confirmado en los controladores) para que las vistas muestren el mensaje real; adjuntar `status` al error.

Refactor (archivo por archivo, reemplazando `fetch` crudo por los helpers; mantener comportamiento idéntico, mismos endpoints y payloads):
- `src/App.jsx` (login): usar `apiPost('/api/auth/login', {...})`. CORREGIR bug: hoy lee `data.mensaje`; el backend devuelve `data.error` (confirmado; incluye el HTTP 429 "Demasiados intentos de inicio de sesion..."). Mostrar `err.message` del apiClient (que trae `data.error`). El login NO debe disparar el redirect de 401 global (es un endpoint público); manejar su error localmente.
- `src/Dashboard.jsx`: `fetchNotifications` (`/api/auditoria`), `configurarMFA` (`/api/auth/mfa/configurar`), `activarMFA` (`/api/auth/mfa/habilitar`). Conservar el manejo de 401 existente de `configurarMFA` (o delegarlo al apiClient).
- `src/views/ActivosView.jsx`: GET `/api/activos`, POST `/api/activos`, DELETE `/api/activos/:id`, y el `Promise.all` de `/api/hallazgos` + `/api/remediacion`.
- `src/views/VulnerabilidadesView.jsx`: GET `/api/hallazgos` + `/api/activos`, GET `/api/hallazgos/nvd/:cve`, POST `/api/hallazgos`, DELETE `/api/hallazgos/:id`, GET detalle `/api/hallazgos/:id`.
- `src/views/RiesgosView.jsx`: GET `/api/riesgos` + `/api/hallazgos`, POST `/api/riesgos` (auto-evaluación en bucle).
- `src/views/RemediacionesView.jsx`: GET `/api/remediacion`+`/api/hallazgos`+`/api/usuarios`, POST `/api/remediacion`, GET `/api/remediacion/:id`, PATCH `/api/remediacion/:id/estado`.
- `src/views/EvidenciasView.jsx`: GET `/api/usuarios`+`/api/auditoria`+`/api/remediacion`, y POST multipart `/api/remediacion/:id/evidencias` vía `apiUpload`.
- `src/views/ReportesView.jsx`: GET `/api/activos`, y la descarga de reporte (`apiGetBlob` o fetch con token según sea blob/JSON — conservar el flujo actual de descarga).
- `src/views/ResumenDashboard.jsx`: GET `/api/hallazgos`+`/api/remediacion`+`/api/riesgos`.
- `src/views/RolesPermisosView.jsx`: GET `/api/roles`, POST/PUT `/api/roles[/:id]`, DELETE `/api/roles/:id`.
- `src/views/UsuariosView.jsx`: GET `/api/usuarios`+`/api/roles`, PUT `/api/usuarios/:id/rol`, POST `/api/usuarios`, DELETE `/api/usuarios/:id`.
- `src/views/ImportacionView.jsx`: GET plantilla `/api/importacion/plantilla` (blob), POST multipart `/api/importacion/excel` vía `apiUpload`. Mantener el manejo de `result.success`/`data.error`.
- `src/App.jsx`: añadir el listener `auth:logout` que resetea a login.

Verificación Fase 3:
- `npm run build` y `npm run lint` sin errores.
- Grep `fetch\(` en `src/**/*.{jsx,js}` → NO debe quedar `fetch` crudo en vistas/Dashboard/App (solo, si acaso, dentro de `apiClient.js`).
- Grep `localStorage.getItem\('vulntrack_token'\)` → solo debe aparecer en `apiClient.js` y `utils/auth.js` (y `App.jsx`/`Dashboard.jsx` donde controlan sesión), no repartido en cada vista.
- Revisión manual: el login muestra `data.error` real (probar flujo de credenciales inválidas y 429 si es posible); flujos MFA intactos (mismos endpoints/payloads).

---

## FASE 4 — Autorización del frontend por PERMISOS (no roles hardcodeados)

Modelo del backend (`backend/src/middlewares/roleMiddleware.js`): `autorizarRoles(...req)` concede si `rol === 'ADMINISTRADOR'` o `permisos.includes('ALL')`, o si para algún requerido `p`: `rol === p || permisos.includes(p)`.

Strings EXACTOS que el backend pasa a `autorizarRoles(...)` (extraídos de `backend/src/routes/*.js`):

| Acción (endpoint) | Strings requeridos por el backend |
|---|---|
| Crear/editar/eliminar Activos (`POST/PUT/DELETE /api/activos`) | `ADMINISTRADOR`, `GESTOR_ACTIVOS` |
| Crear plan Remediación (`POST /api/remediacion`) | `ADMINISTRADOR`, `ANALISTA_SEGURIDAD`, `AUDITOR` |
| Editar/estado/evidencia Remediación (`PUT`, `PATCH /:id/estado`, `POST /:id/evidencias`) | `ADMINISTRADOR`, `ANALISTA_SEGURIDAD`, `REMEDIADOR` |
| Crear/eliminar Hallazgos (`POST/DELETE /api/hallazgos`) | `ADMINISTRADOR`, `AUDITOR` |
| Registrar Riesgo (`POST /api/riesgos`) | `ADMINISTRADOR`, `ANALISTA_SEGURIDAD` |
| Importar Excel (`POST /api/importacion/excel`) | `ADMINISTRADOR` |
| Crear/editar/eliminar Roles (`POST/PUT/DELETE /api/roles`) | `EDITAR_ROLES`, `ADMINISTRADOR` |
| Crear/editar/eliminar Usuarios (`POST /api/usuarios`, `PUT /:id/rol`, `DELETE /:id`) | `ADMINISTRADOR` |

Paso 1 — `src/utils/auth.js`: añadir `tienePermiso(...permisos)` que replique la lógica del backend sobre el token decodificado:
```js
export const tienePermiso = (...requeridos) => {
  const data = getUserData();
  if (!data) return false;
  const { rol, permisos } = data;
  if (rol === 'ADMINISTRADOR' || (Array.isArray(permisos) && permisos.includes('ALL'))) return true;
  return requeridos.some(p => rol === p || (Array.isArray(permisos) && permisos.includes(p)));
};
```
Mantener `getUserData`/`getUserRole`. Comentario que explique el mapeo a cada acción.

Paso 2 — Reemplazar comprobaciones hardcodeadas (`[...roles].includes(getUserRole())` y `getUserRole() === 'ADMINISTRADOR'`) usando los MISMOS strings del backend:
- `ActivosView.jsx` (líneas 198, 296): `['ADMINISTRADOR','GESTOR_ACTIVOS'].includes(getUserRole())` → `tienePermiso('GESTOR_ACTIVOS')`.
- `VulnerabilidadesView.jsx` (líneas 213, 316): `['ADMINISTRADOR','AUDITOR'].includes(getUserRole())` → `tienePermiso('AUDITOR')`.
- `RiesgosView.jsx` (línea 117): `['ADMINISTRADOR','ANALISTA_SEGURIDAD'].includes(getUserRole())` → `tienePermiso('ANALISTA_SEGURIDAD')`.
- `RemediacionesView.jsx` (línea 143): `['ADMINISTRADOR','ANALISTA_SEGURIDAD','AUDITOR'].includes(getUserRole())` → `tienePermiso('ANALISTA_SEGURIDAD','AUDITOR')` (crear plan).
- `ImportacionView.jsx` (línea 85): hoy exige `['ADMINISTRADOR','ANALISTA_SEGURIDAD']`, pero el backend `/excel` SOLO admite `ADMINISTRADOR` (ANALISTA_SEGURIDAD recibiría 403). Es acción claramente administrativa → `tienePermiso('ADMINISTRADOR')` (que ya cubre rol admin / 'ALL'). Documentar la discrepancia en comentario.
- `UsuariosView.jsx` (líneas 133, 171): `getUserRole() === 'ADMINISTRADOR'` → `tienePermiso('ADMINISTRADOR')` (gestión de usuarios = administrativa).
- `RolesPermisosView.jsx`: hoy NO oculta el botón de crear/editar rol por rol (no hay check). Añadir gating de los controles crear/editar/eliminar rol con `tienePermiso('EDITAR_ROLES')` (admin ya cubierto por la lógica). Esto es administrativo. (Verificar en el JSX dónde está el botón "+ Nuevo Rol" y los botones Editar/Eliminar y envolverlos.)

Criterio de permisividad: para acciones NO administrativas sin permiso claro, preferir mostrar y dejar que el backend rechace con 403. Las acciones administrativas (usuarios, roles, importación) sí se ocultan. No se toca `.includes(` que sea de filtrado/búsqueda (no son checks de autorización).

Verificación Fase 4:
- `npm run build` y `npm run lint` sin errores.
- Grep `getUserRole()` en vistas → ya no debe usarse para decidir visibilidad de botones de acción (puede seguir en Dashboard para mostrar el nombre del rol en el header, que es display, no autorización).
- Grep `includes(getUserRole())` → sin coincidencias.
- Revisión manual: con usuario admin se ven todos los controles; con rol limitado se ocultan los administrativos (usuarios/roles/importación) y se muestran los de dominio dejando que el backend aplique 403.

---

## Verificación final (todas las fases)
En `d:\VulnTrack\frontend`: `npm run build` y `npm run lint` sin errores; y los greps de control de cada fase quedan como se indica. Commits locales en `main`; no hacer push.
