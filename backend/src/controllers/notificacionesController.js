const { queryConRLS } = require('../config/db');

// El usuario ve las notificaciones dirigidas a él y las generales de su empresa (RLS limita al tenant)
const obtenerNotificaciones = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    try {
        const r = await queryConRLS(id_empresa,
            `SELECT * FROM notificaciones WHERE (id_usuario = $1 OR id_usuario IS NULL)
             ORDER BY fecha DESC LIMIT 50`, [id_usuario]);
        const noLeidas = r.rows.filter(n => !n.leida).length;
        res.status(200).json({ no_leidas: noLeidas, notificaciones: r.rows });
    } catch (error) {
        console.error('[ERROR NOTIFICACIONES]:', error.message);
        res.status(500).json({ error: 'Error al obtener notificaciones.' });
    }
};

const marcarLeida = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    try {
        await queryConRLS(id_empresa,
            `UPDATE notificaciones SET leida = TRUE WHERE id_notificacion = $1 AND (id_usuario = $2 OR id_usuario IS NULL)`,
            [req.params.id, id_usuario]);
        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la notificación.' });
    }
};

const marcarTodasLeidas = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    try {
        await queryConRLS(id_empresa,
            `UPDATE notificaciones SET leida = TRUE WHERE leida = FALSE AND (id_usuario = $1 OR id_usuario IS NULL)`, [id_usuario]);
        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar notificaciones.' });
    }
};

module.exports = { obtenerNotificaciones, marcarLeida, marcarTodasLeidas };
