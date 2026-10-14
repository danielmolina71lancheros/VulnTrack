const { registrarAuditoria } = require('../utils/auditoriaHelper');

/**
 * Middleware de autorización por permisos granulares (RBAC dinámico).
 * Se valida SIEMPRE en backend, sin importar lo que muestre el frontend (Sección 44).
 * Si se deniega: HTTP 403 + evento PERMISSION_DENIED (Sección 10).
 */
const autorizarRoles = (...permisosRequeridos) => {
    return async (req, res, next) => {
        if (!req.usuario) return res.status(401).json({ error: "No autenticado" });

        const { rol, permisos } = req.usuario;

        if (rol === 'ADMINISTRADOR' || (permisos && permisos.includes('ALL'))) {
            return next();
        }

        const tieneAcceso = permisosRequeridos.some(p =>
            rol === p || (permisos && permisos.includes(p))
        );
        if (tieneAcceso) return next();

        console.warn(`[SEGURIDAD] PERMISSION_DENIED: ${req.usuario.correo} -> ${req.method} ${req.originalUrl}`);
        await registrarAuditoria(req.usuario.id_empresa, req.usuario.id_usuario, 'PERMISSION_DENIED', 'Seguridad',
            { metodo: req.method, ruta: req.originalUrl, requeridos: permisosRequeridos }, req.ip,
            { recurso: 'endpoint', id_recurso: `${req.method} ${req.baseUrl}${req.route?.path || ''}`, resultado: 'DENEGADO',
              descripcion: `Acceso denegado a ${req.method} ${req.originalUrl}` });
        return res.status(403).json({ error: "Acceso denegado. Privilegios insuficientes." });
    };
};

module.exports = { autorizarRoles };
