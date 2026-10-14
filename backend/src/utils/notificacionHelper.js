const { queryConRLS } = require('../config/db');

/**
 * Crea una notificación dentro del tenant (Sección 37).
 * id_usuario = null => visible para toda la empresa.
 */
const crearNotificacion = async (id_empresa, { id_usuario = null, tipo, titulo, mensaje = null, recurso = null, id_recurso = null }) => {
    try {
        await queryConRLS(id_empresa,
            `INSERT INTO notificaciones (id_empresa, id_usuario, tipo, titulo, mensaje, recurso, id_recurso)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id_empresa, id_usuario, tipo, titulo, mensaje, recurso, id_recurso]
        );
    } catch (error) {
        console.error("[ERROR NOTIFICACION]:", error.message);
    }
};

module.exports = { crearNotificacion };
