# Validación de alertas de VulnTrack

## 1. Objetivo

Documentar las pruebas realizadas sobre Prometheus, Alertmanager y la entrega de notificaciones a Telegram.

## 2. Reglas verificadas

| Regla | Condición | Espera |
|---|---|---|
| VulnTrackAPIDown | `up{job="vulntrack-api"} == 0` | 1 minuto |
| VulnTrackHighLatency | Latencia media superior a 1 segundo | 5 minutos |
| VulnTrackHighMemory | Memoria del proceso superior a 400 MiB | 5 minutos |
| VulnTrackHighHTTP5xx | Proporción de errores HTTP 5xx superior al 5 % | 5 minutos |

## 3. Resultados

- `promtool check rules` reconoció las cuatro reglas.
- `promtool test rules` finalizó con `SUCCESS` para las pruebas sintéticas de latencia, memoria y errores HTTP 5xx.
- Prometheus respondió correctamente a `/-/healthy`.
- Alertmanager respondió correctamente a `/-/healthy`.
- Prometheus mostró Alertmanager como destino activo.
- Se recibieron notificaciones de prueba en Telegram para las tres reglas sintéticas.
- Se verificaron previamente las notificaciones de caída y recuperación de la API.
- En la última consulta, las cuatro reglas tenían salud `ok` y estado `inactive`.
- No se encontraron alertas `firing` en la última consulta a Prometheus.

## 4. Interpretación y limitaciones

Las pruebas unitarias verifican la evaluación de las reglas con datos sintéticos. Las pruebas de Telegram verifican la ruta de notificación, pero no demuestran que las condiciones de latencia, memoria o errores HTTP 5xx se hayan producido en un incidente real.

El estado `inactive` es esperado cuando no se cumple la condición de una alerta.

## 5. Pendientes

- Verificar la activación y resolución de cada condición con datos representativos en un entorno controlado.
- Confirmar la entrega a Telegram de alertas originadas por Prometheus para cada regla.
- Mantener el token de Telegram fuera del control de versiones.
- Revisar periódicamente las reglas, umbrales y destino de notificaciones.

## 6. Seguridad

El token de Telegram no debe incluirse en este documento, en archivos de ejemplo ni en el repositorio. La exclusión de `monitoring/alertmanager/telegram-token.txt` se verificó mediante `git check-ignore`.
