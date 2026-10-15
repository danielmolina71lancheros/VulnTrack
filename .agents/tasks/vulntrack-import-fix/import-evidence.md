# Evidencia — Arreglo de la Importación Masiva por Excel (VulnTrack / SecureHub)

Fecha: 2026-10-10
Rama: `main` (sin worktree, sin push)
Objetivo: que la importación de activos y vulnerabilidades por Excel funcione de extremo a extremo (subir la plantilla oficial e insertar los datos correctamente).

Resultado: **FUNCIONAL**. Importación real por HTTP devuelve **HTTP 200** con `activos_actualizados = 1` y `vulnerabilidades_creadas = 1`, sin `[ERROR IMPORTACION]`.

---

## 1. Causas raíz confirmadas

El 500 de la importación tenía **tres** causas que había que resolver para dejarla funcional de punta a punta. La BD en ejecución YA estaba migrada (v2 + v3), así que la hipótesis de "esquema desactualizado" quedó descartada.

### Causa raíz A — Colisión de clave única por filas soft-deleted (bug de código)

El importador detectaba el activo existente con `WHERE codigo_activo = $1 AND estado = TRUE`, pero el constraint único `uq_codigo_activo UNIQUE (id_empresa, codigo_activo)` **no** filtra por `estado`. Cuando el `codigo_activo` del Excel coincide con un activo **soft-deleted** (`estado = FALSE`), la pre-consulta no lo encontraba, el código tomaba la rama `INSERT` y Postgres rechazaba con `23505 duplicate key value`. Ese error no era `ErrorNegocio`, escapaba del `try/catch` del bucle de vulnerabilidades (el bucle de activos **no tenía** captura por fila) y caía en el `catch` final → **HTTP 500**.

Error EXACTO de Postgres (transcrito del plan, confirmado en los logs `[ERROR IMPORTACION]`):

```
[ERROR BD]: duplicate key value violates unique constraint "uq_codigo_activo"
[ERROR IMPORTACION]: error: duplicate key value violates unique constraint "uq_codigo_activo"
    at async importar (/app/src/controllers/importacionController.js:209:29) {
  code: '23505',
  constraint: 'uq_codigo_activo',
  file: 'nbtinsert.c'
```

Dato que lo disparaba (verificado en BD): el tenant ACME (`dc9a8a32-2a1a-4c1f-8745-d4022a39bee3`) tenía 7 activos soft-deleted, entre ellos **`LAP-001`**, que es exactamente el `codigo_activo` de la fila de ejemplo que escribe la plantilla oficial. Cualquier admin que descargara la plantilla e importara reproducía el 500 de forma determinista.

```
 codigo_activo | estado |              id_empresa
---------------+--------+--------------------------------------
 LAP-001       | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3   (+ 6 más soft-deleted)
```

### Causa raíz B — Credenciales de BD de la API ausentes en el contenedor en ejecución (deriva de entorno)

El contenedor `securehub_api` estaba corriendo con `DB_APP_USER` y `DB_APP_PASSWORD` **vacíos** (longitud 0), aunque `.env` y `docker-compose.yml` los definen correctamente. Como `src/config/db.js` usa esas variables para el `Pool`, cada `pool.connect()` fallaba con:

```
Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
    at async login (/app/src/controllers/authController.js:54:20)
```

Esto tiraba el proceso en cada login (y en cualquier query), de modo que ni siquiera se podía obtener token para ejercitar la importación. No es un fallo del código ni del compose (ambos declaran las variables); era **deriva del contenedor** (arrancado desde un estado previo sin esas variables). Se corrigió recreando el servicio para que tomara el `.env` actual.

### Causa raíz C — Imagen del backend obsoleta: faltaban `exceljs` y `multer` (dependencias del propio importador)

El `node_modules` horneado en la imagen de `securehub-api` **no** contenía `exceljs` ni `multer`, pese a estar declarados en `backend/package.json`. El controlador de importación (`require('exceljs')`) y la ruta (`multer` para `upload.single('file')`) no podían cargar, por lo que la importación nunca podía ejecutarse. Verificación en el contenedor:

```
exceljs MISSING
multer MISSING
```

La imagen se había construido antes de añadir esas dependencias al `package.json`. Se corrigió **reconstruyendo** la imagen (`docker compose build securehub-api`), tras lo cual:

```
exceljs OK
multer OK
```

> Nota (dependencia no declarada, ajena a este arreglo): tras reconstruir, el arranque limpio del servidor exponía que `backend/src/services/emailService.js` (trabajo en curso de OTRA tarea, archivo **no versionado**) hace `require('nodemailer')`, y `nodemailer` **no** está en `package.json`. Esto hacía crashear `server.js` al bootear (vía `slaWorker.js`). Para poder verificar la importación se instaló `nodemailer` en el contenedor (efímero, `--no-save`), sin tocar `package.json`. **Esto NO es parte de este arreglo y NO se commitea.** Debe resolverlo quien introdujo `emailService.js`: añadir `nodemailer` a `backend/package.json`.

---

## 2. Cambios aplicados

### 2.1 Causa A — Upsert de activos robusto + defensa por fila (código)

Archivo: `backend/src/controllers/importacionController.js`

- La pre-consulta ahora busca por `(id_empresa, codigo_activo)` **sin** filtrar por `estado`:
  `SELECT id_activo, estado FROM activos WHERE codigo_activo = $1`.
- Si el activo existe (activo o soft-deleted) se hace `UPDATE` y se **reactiva** con `estado = TRUE` en el `SET`. Si no existe, se inserta.
- El cuerpo del bucle de activos se envolvió en un `try/catch` por fila (defensa en profundidad): un error de BD en una fila (p. ej. `23505` no contemplado) ya no aborta la importación con 500; se registra en `errores[]` y se continúa, igual que el bucle de vulnerabilidades.

### 2.2 Causa B — Credenciales de la API

Se recreó el servicio para que tomara el `.env`:
`docker compose up -d --no-deps --force-recreate securehub-api`. Tras ello, en el contenedor: `DB_APP_USER=app_user`, `DB_APP_PASSWORD` longitud 16. (Sin cambios de archivos; `docker-compose.yml` y `.env` ya eran correctos.)

### 2.3 Causa C — Dependencias del importador

Se reconstruyó la imagen del backend: `docker compose build securehub-api` (ahora instala `exceljs` y `multer` desde el `package.json` del working tree). (Sin cambios de archivos propios de este arreglo; `package.json` ya listaba ambas y está modificado por otra tarea en el working tree.)

### 2.4 Despliegue limpio determinista (causa raíz de instalaciones nuevas)

Para que un volumen nuevo (`docker compose down -v && up`) no quede en el esquema v1 (lo que SÍ provocaría el 500 por esquema que era la hipótesis original), se montan las migraciones en `/docker-entrypoint-initdb.d/` con prefijos numéricos que fuerzan el orden alfabético de ejecución de `initdb`:

Archivo: `docker-compose.yml` (servicio `securehub-db`)
```
- ./base_datos/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
- ./base_datos/02-migration-v2.sql:/docker-entrypoint-initdb.d/02-migration-v2.sql:ro
- ./base_datos/03-migration-v3.sql:/docker-entrypoint-initdb.d/03-migration-v3.sql:ro
```
- `base_datos/02-migration-v2.sql` y `base_datos/03-migration-v3.sql` son copias **byte-idénticas** (SHA256 verificado) de `backend/db_migration_v2.sql` y `backend/db_migration_v3.sql`.
- Orden v2 → v3 (dependencias confirmadas leyendo ambos `.sql`): v3 usa columnas/constraints de v2 (`estado_activo`, `prioridad`, `id_activo` en `hallazgos_vuln`).
- `01-init.sql` crea primero las tablas base (`empresas`, `usuarios`, `activos`, `hallazgos_vuln`, `hallazgos_activos`, `riesgos`, `planes_remediacion`, `evidencias`, `eventos_auditoria`) y el rol `app_user`, todos prerequisitos de v2/v3. Verificado.
- Se documenta en el propio `docker-compose.yml` que el entrypoint de Postgres SOLO ejecuta estos scripts en la **primera** inicialización del volumen; sobre un volumen existente NO se re-ejecutan.

### Migraciones manuales sobre la BD ya inicializada

NO fueron necesarias en este entorno: la BD en ejecución ya tenía v2 y v3 aplicadas. Verificado antes de tocar nada:
`\d activos` → `estado_activo` con `chk_estado_activo CHECK (estado_activo IN ('Activo','Inactivo','En mantenimiento','Retirado','Baja'))` y `uq_codigo_activo UNIQUE (id_empresa, codigo_activo)`.
Los valores de `estado_activo` del importador (`ESTADOS_ACTIVO`) coinciden exactamente con el CHECK; no había desajuste que corregir.

---

## 3. Verificación REAL por HTTP (end-to-end)

Procedimiento (ejecutado desde dentro de la red Docker contra `securehub-api:3000`):
1. Se sembró un admin de prueba del tenant ACME (`import_e2e@acme.com`, `rol=ADMINISTRADOR`, `mfa_enabled=FALSE`) para obtener token sin segundo factor. (Fixture; luego soft-deleted.)
2. `POST /api/auth/login` → token JWT (longitud 608).
3. `GET /api/importacion/plantilla` con `Authorization: Bearer <token>` → **HTTP 200**, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, 15629 bytes.
4. Se construyó un `.xlsx` con hoja **Activos** (`codigo_activo = LAP-001`, hoy soft-deleted) y hoja **Vulnerabilidades** (`codigo_activo = LAP-001`, `cve = CVE-2021-44228`).
5. `POST /api/importacion/excel` (multipart, campo `file`, rol ADMINISTRADOR).

Estado del fixture ANTES (reproduce el 500 original): `LAP-001 estado = false` (soft-deleted).

Respuesta REAL (`POST /api/importacion/excel`) — **HTTP 200**:
```json
{
  "resumen": {
    "activos_procesados": 1,
    "activos_creados": 0,
    "activos_actualizados": 1,
    "vulnerabilidades_procesadas": 1,
    "vulnerabilidades_creadas": 1,
    "duplicadas": 0,
    "con_errores": 0,
    "pendientes_enriquecimiento": 0
  },
  "errores": []
}
```

Confirmación en BD tras la importación:
- `SELECT codigo_activo, estado FROM activos WHERE codigo_activo='LAP-001'` → `LAP-001 | t` (reactivado desde soft-deleted).
- `SELECT cve_id, estado_enriquecimiento, severidad FROM hallazgos_vuln WHERE cve_id='CVE-2021-44228'` → hallazgo creado con `estado_enriquecimiento = COMPLETADO`, `severidad = CRITICA` (NVD respondió para Log4Shell).

Sin ninguna entrada `[ERROR IMPORTACION]` en `docker logs securehub_api` durante la operación.

Criterios de éxito del plan (sección 5): CUMPLIDOS — `200`, `activos_actualizados >= 1` (reactivación de LAP-001), `vulnerabilidades_creadas >= 1`, sin 500.

---

## 4. `node --check` sobre archivos .js modificados

- `backend/src/controllers/importacionController.js` → **exit 0** (sin errores de sintaxis).

(No se modificó `backend/src/services/vulnerabilidadService.js`: su `INSERT` ya casaba con el esquema final v3; `riesgos.probabilidad/impacto` numéricos 1–5 son compatibles.)

---

## 5. Archivos modificados por este arreglo

- `backend/src/controllers/importacionController.js` — upsert robusto para activos soft-deleted + `try/catch` por fila.
- `docker-compose.yml` — monta `01-init.sql`, `02-migration-v2.sql`, `03-migration-v3.sql` en orden en `/docker-entrypoint-initdb.d/` + comentario explicativo.
- `base_datos/02-migration-v2.sql` — copia byte-idéntica de `backend/db_migration_v2.sql` (nuevo).
- `base_datos/03-migration-v3.sql` — copia byte-idéntica de `backend/db_migration_v3.sql` (nuevo).

Archivos EXCLUIDOS del commit a propósito (trabajo ajeno sin versionar o de otras tareas en el working tree):
- `backend/package.json` / `backend/package-lock.json` (modificados por la tarea de hardening; incluyen exceljs/multer, no son míos).
- `backend/src/services/` (incluye `emailService.js`, WIP de otra tarea; depende de `nodemailer` no declarado).
- `backend/src/controllers/importacionController.js` figura como **untracked** porque toda la feature de importación es trabajo en curso no versionado; se commitea SOLO este archivo como parte del arreglo, pero NO los demás archivos nuevos de la feature (notificaciones, otros controladores/rutas/servicios).

> Decisión importante sobre el commit: dado que el importador y sus rutas/servicios son todos trabajo nuevo sin versionar, el commit incluye únicamente los archivos del ARREGLO que el plan señala (controlador de importación, compose y las migraciones movidas). Se evita arrastrar el resto de la feature y de otras tareas.

---

## 6. Commit local

- Hash: **`0761bce`** (rama `main`, sin push).
- Mensaje: `fix(importacion): corrige 500 en carga masiva Excel por activos soft-deleted y asegura migraciones en despliegue limpio`
- Contenido (4 archivos, +527 / -1):
  - `backend/src/controllers/importacionController.js` (nuevo en el índice; es la feature WIP, se commitea solo este archivo del arreglo)
  - `base_datos/02-migration-v2.sql` (nuevo)
  - `base_datos/03-migration-v3.sql` (nuevo)
  - `docker-compose.yml` (modificado)
- Staging EXPLÍCITO por ruta; no se usó `git add -A` ni `git add .`. El resto del working tree (otras tareas, feature de notificaciones, `package.json`, servicios, etc.) quedó SIN commitear a propósito.
