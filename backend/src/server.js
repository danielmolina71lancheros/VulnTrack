const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const promClient = require('@prometheus-io/client');

const metricsRegistry = new promClient.Registry();
promClient.collectDefaultMetrics({ register: metricsRegistry });

const httpRequestsTotal = new promClient.Counter({
    name: 'vulntrack_http_requests_total',
    help: 'Total de peticiones HTTP recibidas',
    labelNames: ['method', 'route', 'status_code'],
    registers: [metricsRegistry],
});

const httpRequestDuration = new promClient.Histogram({
    name: 'vulntrack_http_request_duration_seconds',
    help: 'Duracion de las peticiones HTTP en segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [metricsRegistry],
});

// importacion de rutas auth y negocio
const authRoutes = require('./routes/authRoutes');
const activosRoutes = require('./routes/activosRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const hallazgosRoutes = require('./routes/hallazgosRoutes');
const riesgosRoutes = require('./routes/riesgosRoutes');
const remediacionRoutes = require('./routes/remediacionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const auditoriaRoutes = require('./routes/auditoriaRoutes');
const rolesRoutes = require('./routes/rolesRoutes');
const importacionRoutes = require('./routes/importacionRoutes');
const notificacionesRoutes = require('./routes/notificacionesRoutes');

// API stateless: la autenticaciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n protegida utiliza JWT en Authorization: Bearer,
// no cookies de sesiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n enviadas automÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ticamente por el navegador.
// Las peticiones JSON entre orÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­genes requieren preflight y CORS limita los orÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­genes.
// nosemgrep: javascript.express.security.audit.express-check-csurf-middleware-usage.express-check-csurf-middleware-usage -- CSRF middleware basado en cookies no aplica a este esquema Bearer; reevaluar si se introducen cookies de autenticaciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n.
const app = express();

// Confianza en el primer proxy (frontend) para que req.ip refleje la IP real del cliente.
app.set('trust proxy', 1);

// Lista blanca de origenes permitidos por CORS leida de CORS_ORIGINS (CSV).
// Fallback de desarrollo si la variable no esta definida.
const origenesPermitidos = (process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost', 'http://localhost:80']);

// Swagger Documentation

 // 1. Defensas perimetrales
app.disable('x-powered-by');

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-origin' },
}));

// CORS restringido a los origenes autorizados.
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || origenesPermitidos.includes(origin)) {
            return cb(null, true);
        }
        return cb(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
}));

app.use(express.json({ limit: '10kb' }));

// Swagger Documentation
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

app.get('/api-docs.json', (req, res) => {
    res.json(swaggerDocument);
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


// 2. Ruta de validaciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n de infraestructura
app.use((req, res, next) => {
    if (req.path === '/metrics') return next();

    const start = process.hrtime.bigint();
    const route = req.path.startsWith('/api/')
        ? req.path.split('/').slice(0, 3).join('/')
        : req.path;

    res.once('finish', () => {
        const labels = {
            method: req.method,
            route,
            status_code: String(res.statusCode),
        };

        httpRequestsTotal.inc(labels);
        httpRequestDuration.observe(
            labels,
            Number(process.hrtime.bigint() - start) / 1e9
        );
    });

    next();
});

app.get('/health', async (req, res) => {
    res.json({ status: 'OK', servicio: 'SecureHub API', version: '1.0.0' });
});

// MÃƒÆ’Ã‚Â©tricas de observabilidad. No registrar URLs ni parÃƒÆ’Ã‚Â¡metros sensibles.
app.get('/metrics', async (req, res, next) => {
    try {
        res.set('Content-Type', metricsRegistry.contentType);
        res.end(await metricsRegistry.metrics());
    } catch (error) {
        next(error);
    }
});

// rutas de negocio
app.use('/api/auth', authRoutes);
app.use('/api/activos', activosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/hallazgos', hallazgosRoutes);
app.use('/api/riesgos', riesgosRoutes);
app.use('/api/remediacion', remediacionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/importacion', importacionRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

// Manejador de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint no encontrado o mÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©todo no permitido." });
});

const startSLAWorker = require('./workers/slaWorker');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] API Core levantada en puerto ${PORT}`);

  if (process.env.DISABLE_BACKGROUND_WORKERS !== 'true') {
    startSLAWorker();
  } else {
    console.log('[INFO] Workers desactivados para el entorno de pruebas.');
  }
});