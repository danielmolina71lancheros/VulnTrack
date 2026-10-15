# Arreglo del HTTP 500 en la Importación Masiva de Excel (activos soft-deleted)

El commit `0761bce` corrige el 500 de `POST /api/importacion/excel`. La causa raíz es una colisión de clave única: el importador buscaba el activo existente con `WHERE codigo_activo = $1 AND estado = TRUE`, pero el constraint `uq_codigo_activo UNIQUE (id_empresa, codigo_activo)` no filtra por `estado`. Un `codigo_activo` soft-deleted (notablemente `LAP-001`, el ejemplo de la plantilla oficial) escapaba a la pre-consulta, el código tomaba la rama INSERT y Postgres rechazaba con `23505`; como ese error no es `ErrorNegocio` y el bucle de activos carecía de captura por fila, degradaba a 500. El fix hace la pre-consulta sin filtro de `estado`, reactiva (`estado = TRUE`) en la rama UPDATE y envuelve el bucle de activos en un `try/catch` por fila. Además monta `init.sql` + migraciones v2/v3 numeradas en `/docker-entrypoint-initdb.d/` para que un volumen nuevo quede migrado en orden. Watch for: el error exacto de Postgres (criterio 1) está transcrito del plan y no reproducible en los logs actuales porque el contenedor fue recreado tras el fix (confirmed); la verificación HTTP 200 se hizo con un admin fixture sembrado, no con el flujo de login MFA de producción (confirmed, aceptable).

**Verdict**: APPROVED

## High-level view

La corrección ataca la causa raíz correcta y la deja comprobada. El cambio en `importacionController.js` convierte la lógica INSERT-o-UPDATE en un upsert real por `(id_empresa, codigo_activo)` que reactiva activos soft-deleted en lugar de reinsertarlos, eliminando la colisión `23505`. La defensa por fila (`try/catch` que mapea `23505` a un error de negocio y continúa) garantiza que ningún fallo puntual de BD vuelva a convertir la importación en un 500 global; esto replica el patrón que ya tenía el bucle de vulnerabilidades, con lo que ambos bucles quedan simétricos.

El esquema y el importador están alineados: los cinco valores de `ESTADOS_ACTIVO` del controlador son idénticos al `CHECK (estado_activo IN (...))` que impone la v3, y el INSERT de `vulnerabilidadService` en `riesgos` usa `probabilidad`/`impacto` numéricos compatibles con el `CHECK BETWEEN 1 AND 5`. No hay desajuste que corregir.

El arranque limpio queda determinista: las migraciones se montan con prefijos `01/02/03` que fuerzan el orden alfabético de `initdb` (v2 antes que v3, dependencia real porque v3 referencia columnas que crea v2), y las copias en `base_datos/` son byte-idénticas (SHA256 verificado) a los `.sql` fuente. El comentario en el compose documenta explícitamente que `initdb` solo corre en la primera inicialización del volumen.

La verificación funcional es real: una importación HTTP devolvió 200 con `activos_actualizados = 1` y `vulnerabilidades_creadas = 1`, confirmada en BD (LAP-001 reactivado, hallazgo CVE-2021-44228 creado). Dos causas de entorno (credenciales de BD vacías en el contenedor, imagen sin `exceljs`/`multer`) se resolvieron recreando/reconstruyendo, sin tocar archivos del commit. El commit stageó solo los 4 archivos del arreglo por ruta explícita, en español, sin push.

<details>
<summary>Issues (2)</summary>

1. **Error de Postgres no reproducible en logs vivos** — el error exacto `23505 / uq_codigo_activo` que exige el criterio 1 está transcrito del plan con todos los campos de Postgres (code, constraint, file `nbtinsert.c`), pero el buffer de logs actual del contenedor recreado ya no lo contiene. Es coherente con el fix aplicado y no bloquea; dejar constancia de que la captura es anterior a la recreación.
2. **Dependencia `nodemailer` no declarada (ajena al arreglo)** — `emailService.js` (WIP de otra tarea) requiere `nodemailer`, no presente en `package.json`; se instaló efímero para poder verificar. No es parte de este commit, pero quien introduzca `emailService.js` debe declararlo o el arranque limpio crasheará.

</details>

<details>
<summary>Details</summary>

### Upsert por `(id_empresa, codigo_activo)` y reactivación de soft-deleted

El núcleo del arreglo. La pre-consulta pasó de `SELECT id_activo FROM activos WHERE codigo_activo = $1 AND estado = TRUE` a `SELECT id_activo, estado FROM activos WHERE codigo_activo = $1`. Al quitar el filtro `estado = TRUE`, un activo soft-deleted con el mismo código ahora cae en la rama UPDATE en vez de la INSERT, y el `SET` incluye `estado = TRUE`, reactivándolo. Esto cierra exactamente el hueco: la pre-consulta y el constraint `uq_codigo_activo` ahora razonan sobre el mismo universo de filas. El INSERT solo se ejecuta cuando no existe ninguna fila con ese código (ni activa ni soft-deleted), por lo que ya no puede colisionar con el UNIQUE (confirmed, leído en el controlador líneas del bloque upsert).

### Defensa por fila en el bucle de activos

El cuerpo del `for (const f of A.filas)` quedó envuelto en `try/catch`: `e.code === '23505'` se mapea a `codigo_activo ... duplicado` y cualquier otro error de BD a un mensaje genérico, ambos vía `err('Activos', ...)` con `continue` implícito al terminar la iteración. Esto replica el patrón que el bucle de vulnerabilidades ya tenía y elimina la asimetría que causaba el 500: antes, un fallo de BD en un activo escapaba al `catch` final global; ahora se reporta en `errores[]` y la importación continúa devolviendo 200. Buen alineamiento entre ambos bucles (confirmed).

### Alineación esquema vs. importador (criterio 3)

`ESTADOS_ACTIVO = ['Activo','Inactivo','En mantenimiento','Retirado','Baja']` en el controlador es idéntico al `chk_estado_activo CHECK (estado_activo IN ('Activo','Inactivo','En mantenimiento','Retirado','Baja'))` de la v3 (confirmed, ambos leídos). El INSERT de activos escribe `estado_activo` con `estado || 'Activo'` como default, siempre dentro del catálogo. El INSERT de `vulnerabilidadService` en `riesgos` usa `probabilidad`/`impacto` numéricos, compatibles con el `CHECK BETWEEN 1 AND 5`. No hay desajuste que corregir (confirmed).

### Migraciones en orden para despliegue limpio (criterio 2)

El `docker-compose.yml` ahora monta tres scripts numerados en `/docker-entrypoint-initdb.d/`: `01-init.sql`, `02-migration-v2.sql`, `03-migration-v3.sql`. El orden alfabético que impone `initdb` garantiza v2 antes que v3, dependencia real: v3 referencia `estado_activo` y `prioridad` (creadas en v2) y hace `ALTER COLUMN id_activo SET NOT NULL` sobre una columna que v2 añade. Las copias `base_datos/02-migration-v2.sql` y `03-migration-v3.sql` son byte-idénticas a `backend/db_migration_v2.sql` y `v3.sql` (SHA256 verificado: `882E6D...8520` y `ED90E3...BE4B` en ambos lados). El comentario añadido documenta que `initdb` solo corre en la primera inicialización del volumen, cubriendo la nota exigida por el criterio. Sobre un volumen existente las migraciones no se re-ejecutan — correcto y documentado.

### Verificación funcional real (criterio 4)

La evidencia transcribe la respuesta HTTP 200 real con JSON: `activos_procesados: 1`, `activos_actualizados: 1`, `vulnerabilidades_procesadas: 1`, `vulnerabilidades_creadas: 1`, `con_errores: 0`, `errores: []`. Confirmación en BD: `LAP-001 | t` (reactivado desde soft-deleted) y hallazgo `CVE-2021-44228` con `estado_enriquecimiento = COMPLETADO`, `severidad = CRITICA`. El escenario reproduce precisamente el bug (LAP-001 estaba soft-deleted antes) y demuestra la reactivación, que es la ruta que antes fallaba. Spot-check propio: `node --check` del controlador → exit 0; logs vivos del contenedor recreado sin `[ERROR IMPORTACION]`, coherente con el post-fix.

### Causas de entorno resueltas fuera del commit

La evidencia documenta dos causas de entorno que impedían llegar a ejecutar la importación: `DB_APP_USER`/`DB_APP_PASSWORD` vacíos en el contenedor en ejecución (deriva, resuelta con `--force-recreate` para tomar el `.env` correcto) y la imagen del backend sin `exceljs`/`multer` (resuelta reconstruyendo la imagen, ya que `package.json` del working tree los declara). Ninguna tocó archivos del commit: el compose y el `.env` ya eran correctos; el problema era estado del contenedor, no código.

### Alcance del commit (criterio 5)

`git show --stat` confirma 4 archivos: `importacionController.js`, `base_datos/02-migration-v2.sql`, `base_datos/03-migration-v3.sql`, `docker-compose.yml` (+527 / -1). El `git status` muestra abundante trabajo sin commitear de otras tareas (hardening, notificaciones, `package.json`, servicios) que quedó fuera, confirmando staging explícito por ruta y no `git add -A/.`. Mensaje en español con cuerpo descriptivo. Rama `main`, 1 commit por delante de `origin/main`, sin push.

</details>

<details>
<summary>Mapa de archivos</summary>

- `backend/src/controllers/importacionController.js` — upsert por `(id_empresa, codigo_activo)` sin filtro de estado, reactivación en UPDATE y `try/catch` por fila en el bucle de activos.
- `docker-compose.yml` — monta `01-init.sql` + `02-migration-v2.sql` + `03-migration-v3.sql` en `/docker-entrypoint-initdb.d/` con comentario sobre el alcance de `initdb`.
- `base_datos/02-migration-v2.sql` — copia byte-idéntica de `backend/db_migration_v2.sql` (nuevo).
- `base_datos/03-migration-v3.sql` — copia byte-idéntica de `backend/db_migration_v3.sql` (nuevo).

Diff completo: `git show 0761bce`.

</details>
