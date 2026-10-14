const { queryConRLS } = require('../config/db');

/**
 * Registra un evento de auditoría append-only (Sección 42 de la especificación).
 * La firma original se mantiene por compatibilidad; `extra` agrega los campos nuevos.
 * @param {object} extra - { recurso, id_recurso, resultado: 'EXITO'|'FALLO'|'DENEGADO', descripcion }
 */
const registrarAuditoria = async (id_empresa, id_usuario, accion, modulo, detalles = {}, ip_origen = '127.0.0.1', extra = {}) => {
    try {
        await queryConRLS(id_empresa,
            `INSERT INTO eventos_auditoria
                (id_empresa, id_usuario, accion, modulo, detalles, ip_origen, recurso, id_recurso, resultado, descripcion)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                id_empresa, id_usuario || null, accion, modulo, JSON.stringify(detalles || {}), ip_origen,
                extra.recurso || modulo, extra.id_recurso ? String(extra.id_recurso) : null,
                extra.resultado || 'EXITO', extra.descripcion || null
            ]
        );
    } catch (error) {
        // La auditoría nunca debe tumbar la operación de negocio, pero sí dejar rastro en logs
        console.error("[ERROR AUDITORIA HELPER]:", error.message);
    }
};

module.exports = { registrarAuditoria };
