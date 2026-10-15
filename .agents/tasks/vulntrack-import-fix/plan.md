# Plan de corrección — Importación Masiva (HTTP 500)

Tarea: diagnosticar y planificar la corrección del error HTTP 500 en la Carga Masiva de Datos (Excel `.xlsx`) de VulnTrack/SecureHub.
Repo: `d:\VulnTrack` — rama `main`, SIN worktree. El stack ya corre en Docker.

---

## 1. Causa raíz CONFIRMADA (con evidencia real)

**La hipótesis principal (esquema de BD desactualizado) queda DESCARTADA.** La BD en ejecución SÍ tiene aplicadas las migraciones v2 y v3.

**La causa raíz real es una colisión de clave única por filas soft-deleted:** el importador detecta activos existentes con un filtro `estado = TRUE`, pero el constraint único `uq_codigo_activo` NO filtra por `estado`. Cuando el `codigo_activo` del Excel coincide con un activo **soft-deleted** (`estado = FALSE`), la pre-consulta no lo encuentra, el código toma la rama `INSERT`, y Postgres rechaza el INSERT con `23505 duplicate key value`. Ese error NO es un `ErrorNegocio`, por lo que escapa al `catch` interno del bucle y cae en el `catch(error)` final → **HTTP 500**.

### 1.1 Error exacto de Postgres (transcrito de `docker logs securehub_api`)

```
[ERROR BD]: duplicate key value violates unique constraint "uq_codigo_activo"
[ERROR IMPORTACION]: error: duplicate key value violates unique constraint "uq_codigo_activo"
    at /app/node_modules/pg/lib/client.js:694:17
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async importar (/app/src/controllers/importacionController.js:209:29) {
  length: 164,
  severity: 'ERROR',
  code: '23505',
  constraint: 'uq_codigo_activo',
  file: 'nbtinsert.c',
  line: '666',
```

- `code: '23505'` = `unique_violation`.
- `constraint: 'uq_codigo_activo'` → definido en `db_migration_v2.sql` como `UNIQUE (id_empresa, codigo_activo)`.
- La traza apunta a `importacionController.js:209` → la sentencia `INSERT INTO activos (...)` de la rama "else" (activo no existente).

### 1.2 Estado real de la BD en ejecución (evidencia)

Contenedores arriba (`docker ps`): `securehub_api`, `securehub_db`, `securehub_redis`, `securehub_files`, `securehub_frontend`, `securehub_scanner`.

`\dt` lista 12 tablas, incluyendo `historial_vulnerabilidad`, `notificaciones`, `plan_vulnerabilidades` y `roles_empresa` → **v2 y v3 ya aplicadas** (más una tabla `roles_empresa` que no está en ninguno de los tres `.sql` revisados; se aplicó por otra vía).

`\d hallazgos_vuln` confirma todas las columnas de v3: `id_activo` (NOT NULL), `fecha_identificacion`, `observaciones`, `source_type`, `external_id`, `estado_enriquecimiento`, `fecha_publicacion_nvd`, `referencias`, `intentos_nvd`, con los CHECK de estado/severidad de v3.

`\d activos` confirma `codigo_activo`, `estado_activo` con `chk_estado_activo CHECK (estado_activo IN ('Activo','Inactivo','En mantenimiento','Retirado','Baja'))`, `usuario_responsable`, y el constraint `uq_codigo_activo UNIQUE (id_empresa, codigo_activo)` (SIN filtro por `estado`).

`\d riesgos`: `probabilidad`/`impacto` INT con CHECK `BETWEEN 1 AND 5`, columnas generadas `puntaje` y `clasificacion`. El INSERT del servicio (prob/impacto numéricos 1–5) es compatible → **no es el origen del 500**.

**Datos que disparan el bug (evidencia decisiva):**

```
 codigo_activo | estado | id_empresa
---------------+--------+--------------------------------------
 00002         | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3
 ACT-cd6750    | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3
 ACT-e2d300    | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3
 ACT-f282a9    | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3
 ACT-fba0a5    | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3
 LAP-001       | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3
 SRV-DEMO-01   | f      | dc9a8a32-2a1a-4c1f-8745-d4022a39bee3
```

Los 7 activos están soft-deleted (`estado = f`) y pertenecen al mismo tenant (ACME). **`LAP-001` es exactamente el `codigo_activo` de la fila de ejemplo de la plantilla** (`descargarPlantilla` escribe `LAP-001` en la hoja Activos). Por tanto, cualquier admin que descargue la plantilla, deje (o re-use) la fila de ejemplo `LAP-001` e importe, reproduce el 500 de forma determinista.

### 1.3 Mecanismo del bug en el código

En `importacionController.js`, rama de upsert de activos:

```js
// pre-check (línea ~190)
const existente = await queryConRLS(id_empresa,
    'SELECT id_activo FROM activos WHERE codigo_activo = $1 AND estado = TRUE', [codigo]);
if (existente.rows.length) { /* UPDATE */ }
else { /* INSERT ... línea 209 -> colisiona con uq_codigo_activo */ }
```

El `WHERE ... estado = TRUE` ignora las filas soft-deleted; el constraint `UNIQUE (id_empresa, codigo_activo)` no. Además, el `try/catch` del bucle de vulnerabilidades captura `ErrorNegocio`/`duplicado`, pero el bucle de **activos no tiene captura por fila**: cualquier error de BD en un activo aborta toda la importación con 500.

---

## 2. Alcance y hallazgos secundarios (NO corregir en esta tarea)

En los logs aparecen dos errores preexistentes ajenos a la importación; documentarlos pero no tocarlos aquí:
- `[WORKER SLA] Error: FOR UPDATE cannot be applied to the nullable side of an outer join` (slaWorker).
- `[ERROR ESTADO PLAN]: inconsistent types deduced for parameter $1` (flujo de planes).

Sobre migraciones: la BD actual ya está migrada, así que no hay que "aplicar v2/v3" en este entorno. Aun así, el plan incluye el endurecimiento del arranque limpio (sección 4, ítem 5) porque el `docker-compose.yml` solo monta `init.sql` v1 y un `docker compose down -v` dejaría la BD rota en el próximo arranque. Orden de dependencia de migraciones (al leer ambos `.sql`): **v2 antes que v3** — v3 referencia columnas que crea v2: `estado_activo` (v2) usado por `chk_estado_activo` (v3), `prioridad` (v2) usado por `chk_prioridad_plan` (v3), `id_activo` en `hallazgos_vuln` (v2) que v3 marca `SET NOT NULL`.

---

## 3. Desajuste de valores de `estado_activo` (verificado)

No hay desajuste real entre importador y el CHECK de v3. El importador (`ESTADOS_ACTIVO`) usa exactamente `['Activo','Inactivo','En mantenimiento','Retirado','Baja']`, idéntico a `chk_estado_activo`. La plantilla ofrece esos mismos valores en la validación de lista de la columna O. Dejar constancia de que ambos están alineados; no requiere cambio.

---

## 4. Plan de implementación

> Verificación global del proyecto: no hay suite de pruebas automatizada en `backend/` (no se halló `test` ejecutable). La verificación es por HTTP real contra el stack Docker y por inspección SQL, tal como se detalla en cada ítem y en la sección 5. Tras tocar código del backend, el servicio corre con `nodemon` (volumen `./backend/src:/app/src`), por lo que recarga solo; si no, `docker restart securehub_api`.

- [ ] 1. **Corregir el upsert de activos para contemplar filas soft-deleted (causa raíz del 500).**
      En `importar`, reemplazar la rama INSERT/UPDATE por un upsert que detecte el activo por `(id_empresa, codigo_activo)` SIN filtrar por `estado`. Si existe un activo soft-deleted con ese código, reactivarlo (`estado = TRUE`) y actualizar sus campos en lugar de insertar; si existe activo con `estado = TRUE`, actualizar; si no existe, insertar. Opción preferida y mínima: cambiar la pre-consulta a `SELECT id_activo, estado FROM activos WHERE codigo_activo = $1` (quitar `AND estado = TRUE`) y, en la rama UPDATE, añadir `estado = TRUE` al SET para re-activar.
      Files: `d:\VulnTrack\backend\src\controllers\importacionController.js`
      Verify: con el stack arriba, obtener token ADMINISTRADOR y hacer `POST /api/importacion/excel` con una plantilla cuya hoja Activos contenga `LAP-001` (código hoy soft-deleted). Debe responder **HTTP 200** con `resumen.activos_actualizados` incrementado (reactivación) y SIN entrada en logs `[ERROR IMPORTACION]`. Ver sección 5 para el procedimiento exacto.

- [ ] 2. **Blindar el bucle de activos contra errores por fila (defensa en profundidad).**
      Envolver el cuerpo del bucle `for (const f of A.filas)` en un `try/catch` análogo al del bucle de vulnerabilidades: ante error de BD en un activo, registrar `err('Activos', f._fila, ...)`, incrementar un contador de errores y `continue`, en vez de abortar toda la importación con 500. Mapear específicamente `error.code === '23505'` a un mensaje de negocio claro (p. ej. "codigo_activo duplicado"). Así, un fallo puntual nunca degrada a 500 global.
      Files: `d:\VulnTrack\backend\src\controllers\importacionController.js`
      Verify: importar un Excel con una fila de activo que fuerce un conflicto no contemplado y confirmar que la respuesta es **200** con el detalle del error en `errores[]` y el resto de filas procesadas. Revisar que no aparece `[ERROR IMPORTACION]` en `docker logs securehub_api`.

- [ ] 3. **Limpiar el estado residual de datos de prueba soft-deleted del tenant ACME (opcional, para el entorno actual).**
      Documentar/ejecutar, solo si se desea un entorno limpio de demo, la decisión sobre los 7 activos soft-deleted. Con el ítem 1 aplicado ya no causan 500 (se reactivan al re-importar). No se requiere borrado. Si aun así se quiere partir de cero, hacerlo con una sentencia acotada y revisada por `(id_empresa, codigo_activo)`.
      Files: ninguno de producción (acción de datos puntual).
      Verify: `docker exec -i securehub_db psql -U admin_db -d securehub -c "SELECT codigo_activo, estado FROM activos ORDER BY codigo_activo;"` refleja el estado esperado tras la importación de prueba.

- [ ] 4. **Verificación de importación end-to-end por HTTP (ver sección 5).**
      Ejecutar el flujo completo con CVE real `CVE-2021-44228` y confirmar `200` + `resumen` coherente.
      Files: ninguno (verificación).
      Verify: criterios de la sección 5 cumplidos.

- [ ] 5. **(Causa raíz de despliegues limpios) Hacer idempotente el arranque de la BD.**
      El `docker-compose.yml` monta solo `./base_datos/init.sql` v1 en `/docker-entrypoint-initdb.d/`. En un volumen nuevo (`docker compose down -v && up`), la BD quedaría en v1 y el 500 por esquema (la hipótesis original) SÍ ocurriría. Montar también las migraciones con prefijos numéricos para forzar el orden de ejecución de `initdb`: `01-init.sql`, `02-migration-v2.sql`, `03-migration-v3.sql`. Documentar explícitamente en el repo que `initdb` SOLO corre en la **primera** inicialización del volumen de datos (no re-ejecuta en volúmenes existentes), por lo que esto arregla instalaciones nuevas, no actualiza las existentes. Alternativa equivalente: consolidar todo en un `init.sql` idempotente (con `IF NOT EXISTS`/`DROP CONSTRAINT IF EXISTS`, como ya hace v3). Elegida la opción de montar los 3 `.sql` numerados por ser el cambio más pequeño y trazable respecto a los ficheros existentes.
      Files: `d:\VulnTrack\docker-compose.yml` (añadir dos montajes bajo `securehub-db.volumes`); referenciar `d:\VulnTrack\backend\db_migration_v2.sql` y `d:\VulnTrack\backend\db_migration_v3.sql` (o copiarlos a `base_datos/`).
      Verify: en entorno desechable, `docker compose down -v && docker compose up -d`, esperar `healthy`, y confirmar con `\d hallazgos_vuln` y `\d activos` que las columnas de v2/v3 existen; luego ejecutar la importación de la sección 5 y obtener `200`. NO ejecutar `down -v` sobre el entorno actual con datos.

---

## 5. Verificación de la importación REAL por HTTP

Endpoints (montados en `server.js` bajo `/api/importacion`, middleware `verificarToken` + `autorizarRoles('ADMINISTRADOR')`):
- `GET /api/importacion/plantilla` → descarga `VulnTrack_Carga_Masiva.xlsx`.
- `POST /api/importacion/excel` → `multipart/form-data`, campo de archivo `file`, solo rol **ADMINISTRADOR**.

Procedimiento:
1. Login como admin: `POST http://localhost:3000/api/auth/login` con `admin@acme.com`. Nota: el entorno exige MFA tras el primer logout; para pruebas de API usar el token devuelto por el login.
2. Guardar el JWT (`Authorization: Bearer <token>`).
3. Descargar plantilla: `GET http://localhost:3000/api/importacion/plantilla` con el header `Authorization`. Debe responder `200` con `Content-Type` de `.xlsx`.
4. Preparar un `.xlsx` con la hoja **Activos** incluyendo `codigo_activo = LAP-001` (hoy soft-deleted) y la hoja **Vulnerabilidades** con `codigo_activo = LAP-001`, `cve = CVE-2021-44228`.
5. `POST http://localhost:3000/api/importacion/excel` con `file=@archivo.xlsx` y el header `Authorization`.
   - **Antes de la corrección:** `500` con `{ error: 'Error interno durante la importación. Revise el resumen parcial.' }` y `[ERROR IMPORTACION]: ... uq_codigo_activo` en logs.
   - **Después (criterio de éxito):** `200` con `resumen` donde `activos_procesados >= 1` y `activos_actualizados >= 1` (LAP-001 reactivado), `vulnerabilidades_creadas >= 1`, y SIN `[ERROR IMPORTACION]` en `docker logs securehub_api`.
6. Confirmar en BD: `docker exec -i securehub_db psql -U admin_db -d securehub -c "SELECT codigo_activo, estado FROM activos WHERE codigo_activo='LAP-001';"` → `estado = t`. Y `SELECT cve_id, estado_enriquecimiento FROM hallazgos_vuln WHERE cve_id='CVE-2021-44228';` → hallazgo creado (`COMPLETADO` si NVD respondió, o `PENDIENTE` si se difirió).

---

## 6. Supuestos y lagunas

- No hay framework de pruebas en el backend; la verificación es por HTTP + SQL. Si el revisor prefiere tests automatizados, habría que introducir uno (p. ej. supertest), lo que excede el alcance del fix mínimo.
- El token de admin para la verificación depende de la política MFA del entorno; se asume que el login de API devuelve un JWT utilizable sin segundo factor en la primera sesión (coherente con el README).
- El enriquecimiento NVD de `CVE-2021-44228` depende de conectividad externa; si NVD no responde, el hallazgo queda `PENDIENTE` y la importación sigue siendo `200` (comportamiento correcto, no un fallo).
