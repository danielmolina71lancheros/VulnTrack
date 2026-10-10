const { createClient } = require('redis');

// Cliente Redis reutilizable (singleton) para toda la API.
// El host se lee de REDIS_HOST (por defecto el servicio de compose 'securehub-redis')
// y la contraseña de REDIS_PASSWORD. Nunca hardcodear secretos.
const cliente = createClient({
    socket: { host: process.env.REDIS_HOST || 'securehub-redis' },
    password: process.env.REDIS_PASSWORD,
});

// Degradacion fail-open: los errores de Redis SOLO se loguean, nunca tumban la API.
cliente.on('error', (e) => console.error('[REDIS]', e.message));

/**
 * Obtiene el cliente Redis conectado (conexion perezosa).
 * Conecta la primera vez que se invoca; si falla, loguea y devuelve null
 * para que el llamador pueda aplicar fail-open sin romper la operacion.
 * @returns {Promise<import('redis').RedisClientType|null>}
 */
const getRedis = async () => {
    try {
        if (!cliente.isOpen) {
            await cliente.connect();
        }
        return cliente;
    } catch (error) {
        console.error('[REDIS] No se pudo conectar:', error.message);
        return null;
    }
};

/**
 * Incrementa un contador con ventana de expiracion (patron rate-limit).
 * Hace INCR sobre la clave y, si el valor resultante es 1 (primera vez),
 * fija el TTL con EXPIRE. Devuelve el conteo actual o null si Redis no esta
 * disponible. Nunca lanza hacia afuera: captura cualquier error y devuelve null.
 * @param {string} clave - Clave del contador.
 * @param {number} ttlSeg - Segundos de vigencia de la ventana.
 * @returns {Promise<number|null>}
 */
const incrementarContador = async (clave, ttlSeg) => {
    try {
        const redis = await getRedis();
        if (!redis) return null;

        const conteo = await redis.incr(clave);
        if (conteo === 1) {
            await redis.expire(clave, ttlSeg);
        }
        return conteo;
    } catch (error) {
        console.error('[REDIS] Error en incrementarContador:', error.message);
        return null;
    }
};

module.exports = { getRedis, incrementarContador };
