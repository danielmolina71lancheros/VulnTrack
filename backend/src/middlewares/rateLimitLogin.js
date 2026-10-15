const { incrementarContador } = require('../config/redis');

const limitarLogin = ({ ventanaSeg = 900, maximo = 10 } = {}) => {
    return async (req, res, next) => {
        try {
            const ip = req.ip;
            const correo = req.body && req.body.correo
                ? String(req.body.correo).toLowerCase()
                : null;

            const conteoIp = await incrementarContador(`login:ip:${ip}`, ventanaSeg);
            const conteoIpCorreo = correo
                ? await incrementarContador(`login:ipcorreo:${ip}:${correo}`, ventanaSeg)
                : null;

            if (conteoIp === null || (correo && conteoIpCorreo === null)) {
                console.error('[SECURITY] Login rate limiter unavailable: Redis is not responding.');
                return res.status(503).json({ error: 'Login is temporarily unavailable.' });
            }

            if (conteoIp > maximo || (conteoIpCorreo !== null && conteoIpCorreo > maximo)) {
                console.warn('[SECURITY] LOGIN_RATE_LIMITED', {
                    ip,
                    correo,
                    fecha: new Date().toISOString(),
                });
                return res.status(429).json({
                    error: 'Demasiados intentos de inicio de sesion. Intenta de nuevo en unos minutos.',
                });
            }

            return next();
        } catch (error) {
            console.error('[SECURITY] Login rate limiter error:', error.message);
            return res.status(503).json({ error: 'Login is temporarily unavailable.' });
        }
    };
};

module.exports = { limitarLogin };
