const { queryConRLS } = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoriaHelper');

const entero1a5 = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

/**
 * Evalúa (o re-evalúa) el riesgo empresarial de una vulnerabilidad (Secciones 29-30).
 * El puntaje (P x I) y la clasificación los calcula PostgreSQL con columnas generadas.
 * Re-evaluar archiva la evaluación anterior (soft) para conservar la trazabilidad.
 */
const registrarRiesgo = async (req, res) => {
    const { id_hallazgo, justificacion } = req.body;
    const probabilidad = entero1a5(req.body.probabilidad);
    const impacto = entero1a5(req.body.impacto);
    const { id_empresa, id_usuario } = req.usuario;

    if (!id_hallazgo) return res.status(400).json({ error: 'Debe indicar la vulnerabilidad a evaluar.' });
    if (!probabilidad || !impacto) return res.status(400).json({ error: 'Probabilidad e impacto deben ser enteros entre 1 y 5.' });

    try {
        const v = await queryConRLS(id_empresa, 'SELECT cve_id FROM hallazgos_vuln WHERE id_hallazgo = $1 AND estado = TRUE', [id_hallazgo]);
        if (v.rows.length === 0) return res.status(404).json({ error: 'Vulnerabilidad no encontrada.' });

        const previo = await queryConRLS(id_empresa,
            'UPDATE riesgos SET estado = FALSE WHERE id_hallazgo = $1 AND estado = TRUE RETURNING id_riesgo', [id_hallazgo]);

        const r = await queryConRLS(id_empresa,
            `INSERT INTO riesgos (id_empresa, id_hallazgo, probabilidad, impacto, justificacion, evaluado_por)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [id_empresa, id_hallazgo, probabilidad, impacto, justificacion || null, id_usuario]);
        const riesgo = r.rows[0];

        await registrarAuditoria(id_empresa, id_usuario, previo.rows.length ? 'RISK_UPDATED' : 'RISK_CREATED', 'Riesgos',
            { cve_id: v.rows[0].cve_id, probabilidad, impacto, puntaje: riesgo.puntaje, clasificacion: riesgo.clasificacion }, req.ip,
            { recurso: 'riesgo', id_recurso: riesgo.id_riesgo, descripcion: `${v.rows[0].cve_id}: ${probabilidad}×${impacto}=${riesgo.puntaje} (${riesgo.clasificacion})` });
        res.status(201).json(riesgo);
    } catch (error) {
        console.error('[ERROR RIESGO]:', error.message);
        res.status(500).json({ error: 'Error al registrar riesgo.' });
    }
};

const obtenerRiesgos = async (req, res) => {
    const { id_empresa } = req.usuario;
    try {
        const result = await queryConRLS(id_empresa,
            `SELECT r.*, h.cve_id, h.severidad, h.cvss, h.estado_hallazgo, a.codigo_activo, a.nombre AS activo_nombre,
                    a.criticidad AS activo_criticidad, u.nombre_completo AS evaluador
             FROM riesgos r
             JOIN hallazgos_vuln h ON h.id_hallazgo = r.id_hallazgo AND h.estado = TRUE
             JOIN activos a ON a.id_activo = h.id_activo
             LEFT JOIN usuarios u ON u.id_usuario = r.evaluado_por
             WHERE r.estado = TRUE
             ORDER BY r.puntaje DESC, r.fecha_evaluacion DESC`);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('[ERROR LISTAR RIESGOS]:', error.message);
        res.status(500).json({ error: 'Error al obtener riesgos.' });
    }
};

module.exports = { registrarRiesgo, obtenerRiesgos };
