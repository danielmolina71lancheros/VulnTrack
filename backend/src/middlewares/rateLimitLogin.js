const { incrementarContador } = require('../config/redis');
const { registrarAuditoria } = require('../utils/auditoriaHelper');

/**
 * Middleware factory de rate-limiting para el login (defensa anti fuerza bruta).
 * Respaldado por Redis: cuenta intentos por IP y por combinacion IP+correo dentro
 * de una ventana deslizante. Si Redis esta caido aplica fail-open (deja pasar).
 * Se aplica UNICAMENTE a POST /api/auth/login (ver authRoutes.js).
 * @param {object} opciones - { ventanaSeg, maximo }
 */
const limitarLogin = ({ ventanaSeg = 900, maximo = 10 } = {}) => {
    return async (req, res, next) => {
        const ip = req.ip;
        const correo = (req.body && req.body.correo) ? String(req.body.correo).toLowerCase() : null;

        // Contador por IP y, si hay correo, por combinacion IP+correo.
        const conteoIp = await incrementarContador('login:ip:' + ip, ventanaSeg);
        const conteoIpCorreo = correo
            ? await incrementarContador('login:ipcorreo:' + ip + ':' + correo, ventanaSeg)
            : null;

        // Fail-open: si Redis no esta disponible (ambos null) dejamos pasar la peticion.
        if (conteoIp === null && conteoIpCorreo === null) {
            console.error('[SEGURIDAD] Rate-limit login en fail-open: Redis no disponible');
            return next();
        }

        const excedido = (conteoIp !== null && conteoIp > maximo) ||
            (conteoIpCorreo !== null && conteoIpCorreo > maximo);

        if (excedido) {
            // Auditoria best-effort: no debe romper la respuesta 429.
            try {
                await registrarAuditoria('BYPASS', null, 'LOGIN_RATE_LIMITED', 'Seguridad',
                    { ip, correo }, req.ip,
                    { recurso: 'login', resultado: 'DENEGADO', descripcion: 'Bloqueo por fuerza bruta en login' });
            } catch (error) {
                console.error('[SEGURIDAD] No se pudo auditar LOGIN_RATE_LIMITED:', error.message);
            }
            return res.status(429).json({ error: 'Demasiados intentos de inicio de sesion. Intenta de nuevo en unos minutos.' });
        }

        return next();
    };
};

module.exports = { limitarLogin };
