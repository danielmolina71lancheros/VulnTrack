const { queryConRLS } = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoriaHelper');

const crearActivo = async (req, res) => {
    let {
        codigo_activo, nombre, tipo, marca, modelo, numero_serie,
        hostname, direccion_ip, endpoint, sistema_operativo, version_so,
        usuario_responsable, area, sede, estado_activo, criticidad,
        descripcion, fecha_adquisicion
    } = req.body;
    const { id_empresa, id_usuario } = req.usuario;

    if (!nombre || !tipo || !codigo_activo) {
        return res.status(400).json({ error: "Código, nombre y tipo de activo son obligatorios." });
    }

    try {
        const result = await queryConRLS(id_empresa,
            `INSERT INTO activos (
                id_empresa, codigo_activo, nombre, tipo, marca, modelo, numero_serie,
                hostname, direccion_ip, endpoint, sistema_operativo, version_so,
                usuario_responsable, area, sede, estado_activo, criticidad,
                descripcion, fecha_adquisicion, propietario
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
            ) RETURNING *`,
            [
                id_empresa, codigo_activo, nombre, tipo, marca, modelo, numero_serie,
                hostname, direccion_ip, endpoint, sistema_operativo, version_so,
                usuario_responsable, area, sede, estado_activo || 'Activo', criticidad || 'MEDIA',
                descripcion, fecha_adquisicion || null, usuario_responsable || 'No asignado'
            ]
        );
        const activo = result.rows[0];
        await registrarAuditoria(id_empresa, id_usuario, 'ASSET_CREATED', 'Activos', { id_activo: activo.id_activo, codigo_activo }, req.ip);
        res.status(201).json(activo);
    } catch (error) {
        console.error("[ERROR CREAR ACTIVO]:", error.message);
        if (error.code === '23505') {
            return res.status(400).json({ error: "El código de activo ya existe." });
        }
        res.status(500).json({ error: "Fallo al crear el activo." });
    }
};

const obtenerActivos = async (req, res) => {
    const { id_empresa } = req.usuario;
    try {
        const result = await queryConRLS(id_empresa,
            `SELECT * FROM activos WHERE estado = TRUE ORDER BY fecha_creacion DESC`
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("[ERROR OBTENER ACTIVOS]:", error.message);
        res.status(500).json({ error: "Fallo al obtener los activos." });
    }
};

const obtenerActivoPorId = async (req, res) => {
    const { id } = req.params;
    const { id_empresa } = req.usuario;
    try {
        const result = await queryConRLS(id_empresa,
            `SELECT * FROM activos WHERE id_activo = $1 AND estado = TRUE`, [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "Activo no encontrado." });

        // Cargar vulnerabilidades asociadas
        const vulnResult = await queryConRLS(id_empresa,
            `SELECT h.*,
    (SELECT string_agg(p.nombre, ', ') FROM plan_vulnerabilidades pv JOIN planes_remediacion p ON p.id_plan = pv.id_plan
     WHERE pv.id_hallazgo = h.id_hallazgo AND p.estado = TRUE AND pv.estado = TRUE) AS planes_asignados
     FROM hallazgos_vuln h WHERE h.id_activo = $1 AND h.estado = TRUE`, [id]
        );

        const activo = result.rows[0];
        activo.vulnerabilidades = vulnResult.rows;

        res.status(200).json(activo);
    } catch (error) {
        console.error("[ERROR OBTENER ACTIVO]:", error.message);
        res.status(500).json({ error: "Fallo al obtener el activo." });
    }
};

const actualizarActivo = async (req, res) => {
    const { id } = req.params;
    const {
        codigo_activo, nombre, tipo, marca, modelo, numero_serie,
        hostname, direccion_ip, endpoint, sistema_operativo, version_so,
        usuario_responsable, area, sede, estado_activo, criticidad,
        descripcion, fecha_adquisicion
    } = req.body;
    const { id_empresa, id_usuario } = req.usuario;

    try {
        const result = await queryConRLS(id_empresa,
            `UPDATE activos
             SET codigo_activo = COALESCE($1, codigo_activo),
                 nombre = COALESCE($2, nombre),
                 tipo = COALESCE($3, tipo),
                 marca = COALESCE($4, marca),
                 modelo = COALESCE($5, modelo),
                 numero_serie = COALESCE($6, numero_serie),
                 hostname = COALESCE($7, hostname),
                 direccion_ip = COALESCE($8, direccion_ip),
                 endpoint = COALESCE($9, endpoint),
                 sistema_operativo = COALESCE($10, sistema_operativo),
                 version_so = COALESCE($11, version_so),
                 usuario_responsable = COALESCE($12, usuario_responsable),
                 area = COALESCE($13, area),
                 sede = COALESCE($14, sede),
                 estado_activo = COALESCE($15, estado_activo),
                 criticidad = COALESCE($16, criticidad),
                 descripcion = COALESCE($17, descripcion),
                 fecha_adquisicion = COALESCE($18, fecha_adquisicion)
             WHERE id_activo = $19 AND estado = TRUE
             RETURNING *`,
            [
                codigo_activo, nombre, tipo, marca, modelo, numero_serie,
                hostname, direccion_ip, endpoint, sistema_operativo, version_so,
                usuario_responsable, area, sede, estado_activo, criticidad,
                descripcion, fecha_adquisicion, id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Activo no encontrado o no tienes permisos." });
        }
        await registrarAuditoria(id_empresa, id_usuario, 'ASSET_UPDATED', 'Activos', { id_activo: id }, req.ip);
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error("[ERROR ACTUALIZAR ACTIVO]:", error.message);
        res.status(500).json({ error: "Fallo al actualizar el activo." });
    }
};

const eliminarActivo = async (req, res) => {
    const { id } = req.params;
    const { id_empresa, id_usuario } = req.usuario;

    try {
        const result = await queryConRLS(id_empresa,
            `UPDATE activos SET estado = FALSE WHERE id_activo = $1 AND estado = TRUE RETURNING id_activo`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Activo no encontrado o ya estaba inactivo." });
        }
        await registrarAuditoria(id_empresa, id_usuario, 'ASSET_DELETED', 'Activos', { id_activo: id }, req.ip);
        res.status(200).json({ mensaje: "Activo dado de baja (Soft Delete) exitosamente." });
    } catch (error) {
        console.error("[ERROR ELIMINAR ACTIVO]:", error.message);
        res.status(500).json({ error: "Fallo al dar de baja el activo." });
    }
};

module.exports = { crearActivo, obtenerActivos, obtenerActivoPorId, actualizarActivo, eliminarActivo };
