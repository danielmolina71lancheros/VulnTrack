# Verificación de los dos arreglos de frontend en SecureHub

Esta revisión verifica dos arreglos ya aplicados sobre `main` (sin commitear) en el frontend de SecureHub: el bug de MFA que volvía a exigir el segundo factor al cerrar sesión aunque el usuario ya lo hubiera habilitado, y la pérdida de legibilidad de las gráficas de Recharts en modo oscuro. La verificación se apoya en la nota de evidencia del paso coder (`verify-evidence.md`), en el `git diff` de los dos archivos tocados y en las capturas reales en claro y oscuro. No se re-ejecutó build, lint, docker ni Playwright; solo se hizo spot-check puntual del diff y de la captura oscura. Watch for: nada bloqueante — los cinco criterios se cumplen con evidencia que pude confirmar de forma independiente.

**Verdict**: APPROVED

## Vista de alto nivel

El fix de MFA es una sola línea (`setMfaEnabledSession(true)`) añadida en `activarMFA()` tras la llamada exitosa al backend. Pude confirmar la coherencia completa del guard: `mfaEnabledSession` se inicializa desde `getUserData().mfa_enabled` (false en el JWT de login), `handleLogoutAttempt` fuerza el MFA cuando ese estado es false, y el nuevo set lo pone a true en memoria durante la sesión, de modo que el guard deja de disparar al salir. Resuelve exactamente el síntoma reportado.

El fix de gráficas introduce un hook `useIsDark()` (MutationObserver sobre la clase `dark` de `<html>`) y un objeto `chartTheme` que colorea solo los elementos estructurales del chart (grid, ticks, tooltip, leyendas) por tema. Los colores de dato/severidad quedan intactos salvo BAJA, que pasa de `#3B82F6` a `#60A5FA` por contraste. Los dos PieChart ganan `stroke` del color de fondo para separar segmentos, y títulos y números de métricas reciben `dark:text-gray-100`.

La evidencia de build (exit 0, `dist/` regenerado) y lint (exit 0, solo warnings preexistentes) está documentada, y hay tres capturas reales (claro, oscuro, oscuro con tooltip). El spot-check de la captura oscura confirma líneas nítidas, ejes y rejilla legibles, segmentos de pie separados, leyendas y títulos legibles, marca "SecureHub" y sin regresión aparente. No se tocaron la clave `vulntrack_token` ni rutas `/api`; textos y comentarios en español.

<details>
<summary>Issues (0)</summary>

Ningún hallazgo bloqueante ni accionable.

</details>

<details>
<summary>Details</summary>

### Criterio 1 — Fix de MFA y coherencia del guard

El diff añade en `activarMFA()`, inmediatamente después de `await apiPost('/api/auth/mfa/habilitar', ...)`, la línea `setMfaEnabledSession(true)` con un comentario que explica por qué: el JWT en localStorage se emitió en el login con `mfa_enabled=false` y no se reemite al habilitar MFA, así que hay que reflejar el cambio en el estado en memoria.

Rastreé la coherencia con el resto del componente (grep sobre `Dashboard.jsx`), no solo el diff: `mfaEnabledSession` se inicializa en el `useEffect` de montaje desde `getUserData().mfa_enabled || false`; `handleLogoutAttempt` solo deja salir si `mfaEnabledSession` es true y, si es false, bloquea e invoca `configurarMFA()`. Con el nuevo set, un usuario que habilita MFA durante la sesión ya no vuelve a toparse con el guard al cerrar sesión. Confirmado — resuelve el síntoma reportado.

### Criterio 2 — Legibilidad de gráficas en oscuro sin tocar colores de dato

El diff confirma, uno a uno, los elementos exigidos: hook `useIsDark()` con MutationObserver sobre `attributeFilter: ['class']` de `document.documentElement`; `chartTheme` ternario por tema con `grid`, `tick`, `tooltipBg`, `tooltipBorder`, `tooltipText`; `tooltipStyle` derivado; `CartesianGrid stroke={chartTheme.grid}`, `XAxis`/`YAxis` con `tick={{ fill: chartTheme.tick }}`, `Tooltip` con `contentStyle/itemStyle/labelStyle`, `Legend wrapperStyle`; `stroke={chartTheme.tooltipBg} strokeWidth={2}` en las `Cell` de los dos PieChart; y `text-gray-900 dark:text-gray-100` en los tres títulos de gráfica y en los números de las tarjetas de métricas.

El único color de dato tocado es `COLORS_SEVERIDAD.BAJA` (`#3B82F6` → `#60A5FA`), justificado por contraste. El resto quedan intactos en el diff: `CRITICA #EF4444`, `ALTA #F97316`, `MEDIA #EAB308`, SLA (`#10B981/#F59E0B/#EF4444`) y estado (`ABIERTO #EF4444`, `EN_PROCESO #3B82F6`, `CERRADO #10B981`). Nótese que `EN_PROCESO` conserva `#3B82F6` tal como exige el criterio: el cambio de azul aplica solo a la severidad BAJA, no al estado. Confirmado.

### Criterios 3 y 4 — Evidencia de build/lint y capturas reales

La nota documenta `npm run build` con exit 0 y `dist/` regenerado (`index.html`, `assets/index-*.css`, `assets/index-*.js`), con el aviso de "chunks > 500 kB" identificado correctamente como advisory preexistente de Vite, no error. El lint (oxlint) termina en exit 0 con solo warnings preexistentes (immutability / set-state-in-effect / vars sin usar), ninguno atribuible a los dos arreglos de una sola línea cada uno. El `EBADENGINE` de Node 20.17 vs 20.19 es warning y no bloquea.

Las tres capturas existen en disco (`dashboard-claro.png`, `dashboard-oscuro.png`, `dashboard-oscuro-tooltip.png`). Abrí `dashboard-oscuro.png` como spot-check: el LineChart muestra las cuatro líneas nítidas sobre el fondo oscuro con el azul BAJA claramente visible; ejes X (May–Oct) y Y (0–2) legibles; rejilla discontinua distinguible sin resultar dura; ambos PieChart con segmentos separados por el stroke de fondo; leyendas ("Altas/Bajas/Críticas/Medias", "Dentro/En riesgo/Vencidas", "Abiertas/Cerradas/En proceso") legibles; títulos y números de métricas (3, 3, 8, CRITICO) claros sobre el fondo oscuro. La marca "SecureHub" aparece en el sidebar. La evidencia del tooltip (fondo `#1F2937`, texto `#F3F4F6`) es coherente con `tooltipStyle` del diff. No-regresión en claro documentada y consistente con los valores del tema claro del `chartTheme`.

### Criterio 5 — Sin tocar `vulntrack_token` ni `/api`; español

El grep sobre el diff completo no muestra ninguna modificación de la clave `vulntrack_token` ni de rutas `/api` en los archivos de código: la única línea con `/api` en el diff de los dos archivos es `apiPost('/api/auth/mfa/habilitar', ...)`, que es contexto sin cambios. Los demás matches de `vulntrack_token`/`/api` provienen de documentos de planeación bajo `.agents/tasks`, no de código fuente. Todos los comentarios añadidos están en español. Confirmado.

</details>

<details>
<summary>Mapa de archivos</summary>

- `frontend/src/Dashboard.jsx` — una línea `setMfaEnabledSession(true)` + comentario en `activarMFA()`; fix del guard de MFA.
- `frontend/src/views/ResumenDashboard.jsx` — hook `useIsDark()`, `chartTheme`/`tooltipStyle`, theming de grid/ticks/tooltip/leyendas, stroke de fondo en los PieChart, `dark:text-gray-100` en títulos y métricas, BAJA `#3B82F6`→`#60A5FA`.

Diff completo: `git -C d:\VulnTrack diff -- frontend/src/Dashboard.jsx frontend/src/views/ResumenDashboard.jsx`

</details>
