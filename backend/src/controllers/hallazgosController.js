const { queryConRLS } = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoriaHelper');
const { consultarCve } = require('../services/nvdService');
const { crearVulnerabilidad, cambiarEstadoVulnerabilidad, ErrorNegocio } = require('../services/vulnerabilidadService');

const manejarError = (res, error, contexto) => {
    if (error instanceof ErrorNegocio) return res.status(error.codigo).json({ error: error.message });
    console.error(`[ERROR ${contexto}]:`, error.message);
    return res.status(500).json({ error: `Error interno (${contexto}).` });
};

const crearHallazgo = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    try {
        const vuln = await crearVulnerabilidad(id_empresa, id_usuario, { ...req.body, source_type: 'MANUAL' }, { ip: req.ip });
        res.status(201).json(vuln);
    } catch (error) { manejarError(res, error, 'CREAR VULNERABILIDAD'); }
};

const SELECT_VULN = `
    SELECT h.*, a.codigo_activo, a.nombre AS activo_nombre, a.criticidad AS activo_criticidad,
           r.probabilidad, r.impacto, r.puntaje AS riesgo_puntaje, r.clasificacion AS riesgo_clasificacion,
           (SELECT COUNT(*) FROM plan_vulnerabilidades pv JOIN planes_remediacion p ON p.id_plan = pv.id_plan
             WHERE pv.id_hallazgo = h.id_hallazgo AND p.estado = TRUE AND pv.estado = TRUE) AS planes_count,
           (SELECT string_agg(p.nombre, ', ') FROM plan_vulnerabilidades pv JOIN planes_remediacion p ON p.id_plan = pv.id_plan
             WHERE pv.id_hallazgo = h.id_hallazgo AND p.estado = TRUE AND pv.estado = TRUE) AS planes_asignados
    FROM hallazgos_vuln h
    JOIN activos a ON a.id_activo = h.id_activo
    LEFT JOIN riesgos r ON r.id_hallazgo = h.id_hallazgo AND r.estado = TRUE`;

const obtenerHallazgos = async (req, res) => {
    const { id_empresa } = req.usuario;
    const { id_activo } = req.query;
    try {
        const params = [];
        let where = 'WHERE h.estado = TRUE';
        if (id_activo) { params.push(id_activo); where += ` AND h.id_activo = $${params.length}`; }
        const result = await queryConRLS(id_empresa, `${SELECT_VULN} ${where} ORDER BY h.fecha_descubrimiento DESC`, params);
        res.status(200).json(result.rows);
    } catch (error) { manejarError(res, error, 'LISTAR VULNERABILIDADES'); }
};

// Sección 53/54: trazabilidad completa de una vulnerabilidad
const obtenerHallazgoPorId = async (req, res) => {
    const { id_empresa } = req.usuario;
    const { id } = req.params;
    try {
        const vuln = await queryConRLS(id_empresa,
            `${SELECT_VULN.replace('SELECT h.*,', 'SELECT h.*, u.nombre_completo AS registrado_por,')}
             LEFT JOIN usuarios u ON u.id_usuario = h.id_auditor
             WHERE h.id_hallazgo = $1 AND h.estado = TRUE`, [id]);
        if (vuln.rows.length === 0) return res.status(404).json({ error: 'Vulnerabilidad no encontrada.' });

        const planes = await queryConRLS(id_empresa,
            `SELECT p.id_plan, p.nombre, p.estado_plan, p.prioridad, p.fecha_limite, u.nombre_completo AS responsable
             FROM plan_vulnerabilidades pv
             JOIN planes_remediacion p ON p.id_plan = pv.id_plan
             LEFT JOIN usuarios u ON u.id_usuario = p.id_remediador
             WHERE pv.id_hallazgo = $1 AND pv.estado = TRUE AND p.estado = TRUE
             ORDER BY p.fecha_limite`, [id]);
        const historial = await queryConRLS(id_empresa,
            `SELECT hv.*, u.nombre_completo AS usuario
             FROM historial_vulnerabilidad hv LEFT JOIN usuarios u ON u.id_usuario = hv.id_usuario
             WHERE hv.id_hallazgo = $1 ORDER BY hv.fecha DESC`, [id]);

        res.status(200).json({ ...vuln.rows[0], planes: planes.rows, historial: historial.rows });
    } catch (error) { manejarError(res, error, 'DETALLE VULNERABILIDAD'); }
};

const cambiarEstado = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    try {
        const vuln = await cambiarEstadoVulnerabilidad(id_empresa, id_usuario, req.params.id, req.body.estado, req.body.comentario, req.ip);
        res.status(200).json(vuln);
    } catch (error) { manejarError(res, error, 'CAMBIAR ESTADO'); }
};

const actualizarHallazgo = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    const { observaciones, fuente, fecha_identificacion } = req.body;
    try {
        const r = await queryConRLS(id_empresa,
            `UPDATE hallazgos_vuln SET observaciones = COALESCE($1, observaciones), fuente = COALESCE($2, fuente),
                    fecha_identificacion = COALESCE($3, fecha_identificacion), fecha_actualizacion = NOW()
             WHERE id_hallazgo = $4 AND estado = TRUE RETURNING *`,
            [observaciones, fuente, fecha_identificacion || null, req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Vulnerabilidad no encontrada.' });
        await registrarAuditoria(id_empresa, id_usuario, 'VULNERABILITY_UPDATED', 'Vulnerabilidades',
            { cve_id: r.rows[0].cve_id }, req.ip, { recurso: 'vulnerabilidad', id_recurso: req.params.id });
        res.status(200).json(r.rows[0]);
    } catch (error) { manejarError(res, error, 'ACTUALIZAR VULNERABILIDAD'); }
};

const eliminarHallazgo = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    try {
        const r = await queryConRLS(id_empresa,
            `UPDATE hallazgos_vuln SET estado = FALSE, deleted_at = NOW(), deleted_by = $2
             WHERE id_hallazgo = $1 AND estado = TRUE RETURNING cve_id`, [req.params.id, id_usuario]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Vulnerabilidad no encontrada.' });
        await registrarAuditoria(id_empresa, id_usuario, 'VULNERABILITY_DELETED', 'Vulnerabilidades',
            { cve_id: r.rows[0].cve_id }, req.ip, { recurso: 'vulnerabilidad', id_recurso: req.params.id });
        res.status(200).json({ mensaje: 'Vulnerabilidad dada de baja (eliminación lógica).' });
    } catch (error) { manejarError(res, error, 'ELIMINAR VULNERABILIDAD'); }
};

// Sección 26: reintento manual de enriquecimiento
const reenriquecer = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    try {
        const v = await queryConRLS(id_empresa, 'SELECT cve_id FROM hallazgos_vuln WHERE id_hallazgo = $1 AND estado = TRUE', [req.params.id]);
        if (v.rows.length === 0) return res.status(404).json({ error: 'Vulnerabilidad no encontrada.' });
        const nvd = await consultarCve(v.rows[0].cve_id);
        if (!nvd.ok) {
            await queryConRLS(id_empresa, 'UPDATE hallazgos_vuln SET intentos_nvd = intentos_nvd + 1 WHERE id_hallazgo = $1', [req.params.id]);
            return res.status(502).json({ error: `NVD no disponible (${nvd.motivo}). Sigue pendiente de enriquecimiento.` });
        }
        const r = await queryConRLS(id_empresa,
            `UPDATE hallazgos_vuln SET descripcion = $1, cvss = $2, severidad = $3, fecha_publicacion_nvd = $4,
                    referencias = $5, estado_enriquecimiento = 'COMPLETADO', intentos_nvd = intentos_nvd + 1, fecha_actualizacion = NOW()
             WHERE id_hallazgo = $6 RETURNING *`,
            [nvd.descripcion, nvd.cvss, nvd.severidad, nvd.fecha_publicacion, JSON.stringify(nvd.referencias), req.params.id]);
        await registrarAuditoria(id_empresa, id_usuario, 'VULNERABILITY_UPDATED', 'Vulnerabilidades',
            { cve_id: v.rows[0].cve_id, enriquecimiento: 'NVD' }, req.ip, { recurso: 'vulnerabilidad', id_recurso: req.params.id });
        res.status(200).json(r.rows[0]);
    } catch (error) { manejarError(res, error, 'REENRIQUECER'); }
};

// Vista previa NVD para el formulario (solo lectura, no registra nada)
const consultarNVD = async (req, res) => {
    const nvd = await consultarCve(req.params.cve);
    if (nvd.ok) return res.status(200).json(nvd);
    const mensajes = {
        FORMATO_INVALIDO: [400, 'Formato de CVE inválido. Use CVE-AAAA-NNNN.'],
        NO_ENCONTRADO: [404, 'El CVE no existe en NVD.'],
    };
    const [codigo, msg] = mensajes[nvd.motivo] || [502, `NVD no disponible (${nvd.motivo}). Puede registrar igual; quedará pendiente de enriquecimiento.`];
    res.status(codigo).json({ error: msg, motivo: nvd.motivo });
};

module.exports = {
    crearHallazgo, obtenerHallazgos, obtenerHallazgoPorId, cambiarEstado,
    actualizarHallazgo, eliminarHallazgo, reenriquecer, consultarNVD
};
