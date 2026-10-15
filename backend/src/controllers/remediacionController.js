const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { queryConRLS } = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoriaHelper');
const { crearNotificacion } = require('../utils/notificacionHelper');
const { cambiarEstadoVulnerabilidad } = require('../services/vulnerabilidadService');

const ESTADOS_PLAN = ['PENDIENTE', 'EN_EJECUCION', 'COMPLETADO', 'VENCIDO', 'CANCELADO'];
const ESTADO_VULNERABILIDAD_POR_PLAN = new Map([['EN_EJECUCION', 'EN_REMEDIACION'], ['COMPLETADO', 'CORREGIDA']]);
const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTENSIONES_EVIDENCIA = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx']);
const ARCHIVO_EVIDENCIA_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.(?:pdf|png|jpg|jpeg|txt|csv|doc|docx|xls|xlsx|bin))?$/i;

const resolverRutaConfinada = (base, ...segmentos) => {
    const raiz = path.resolve(base);
    const destino = path.resolve(raiz, ...segmentos.map(segmento => path.basename(String(segmento))));
    const relativo = path.relative(raiz, destino);
    if (!relativo || relativo === '..' || relativo.startsWith(`..${path.sep}`) || path.isAbsolute(relativo)) return null;
    return destino;
};

const SELECT_PLAN = `
    SELECT p.*, u.nombre_completo AS responsable, a.codigo_activo, a.nombre AS activo_nombre,
           (SELECT COUNT(*) FROM plan_vulnerabilidades pv WHERE pv.id_plan = p.id_plan AND pv.estado = TRUE) AS total_vulnerabilidades
    FROM planes_remediacion p
    LEFT JOIN usuarios u ON u.id_usuario = p.id_remediador
    LEFT JOIN activos a ON a.id_activo = p.id_activo`;

const crearPlan = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    const { nombre, descripcion, plan_accion, id_remediador, prioridad, fecha_inicio, fecha_limite, id_activo } = req.body;
    let { vulnerabilidades } = req.body;   // array de id_hallazgo

    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre del plan es obligatorio.' });
    if (!fecha_limite) return res.status(400).json({ error: 'La fecha límite es obligatoria (SLA).' });
    if (fecha_inicio && new Date(fecha_limite) < new Date(fecha_inicio)) {
        return res.status(400).json({ error: 'La fecha límite no puede ser anterior a la fecha de inicio.' });
    }
    if (!Array.isArray(vulnerabilidades) || vulnerabilidades.length === 0) {
        return res.status(400).json({ error: 'Seleccione al menos una vulnerabilidad a remediar.' });
    }
    vulnerabilidades = [...new Set(vulnerabilidades)];
    const prio = PRIORIDADES.includes(prioridad) ? prioridad : 'MEDIA';

    try {
        // Validar que todas las vulnerabilidades existen en el tenant (RLS) y, si hay activo, que pertenezcan a él
        const v = await queryConRLS(id_empresa,
            `SELECT id_hallazgo, id_activo, cve_id, estado_hallazgo FROM hallazgos_vuln
             WHERE id_hallazgo = ANY($1::uuid[]) AND estado = TRUE`, [vulnerabilidades]);
        if (v.rows.length !== vulnerabilidades.length) {
            return res.status(400).json({ error: 'Alguna de las vulnerabilidades seleccionadas no existe.' });
        }
        if (id_activo && v.rows.some(x => x.id_activo !== id_activo)) {
            return res.status(400).json({ error: 'Todas las vulnerabilidades deben pertenecer al activo del plan.' });
        }
        if (id_remediador) {
            const u = await queryConRLS(id_empresa, 'SELECT 1 FROM usuarios WHERE id_usuario = $1 AND estado = TRUE', [id_remediador]);
            if (u.rows.length === 0) return res.status(400).json({ error: 'El responsable indicado no existe.' });
        }
        // Si todas las vulnerabilidades son del mismo activo, el plan queda asociado a ese activo
        const activosUnicos = [...new Set(v.rows.map(x => x.id_activo))];
        const activoPlan = id_activo || (activosUnicos.length === 1 ? activosUnicos[0] : null);

        const r = await queryConRLS(id_empresa,
            `INSERT INTO planes_remediacion (id_empresa, nombre, descripcion, plan_accion, id_remediador, prioridad,
                fecha_inicio, fecha_limite, estado_plan, id_activo, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, CURRENT_DATE),$8,'PENDIENTE',$9,$10) RETURNING *`,
            [id_empresa, nombre.trim(), descripcion || null, plan_accion || descripcion || nombre.trim(),
             id_remediador || null, prio, fecha_inicio || null, fecha_limite, activoPlan, id_usuario]);
        const plan = r.rows[0];

        for (const vu of v.rows) {
            await queryConRLS(id_empresa,
                'INSERT INTO plan_vulnerabilidades (id_empresa, id_plan, id_hallazgo) VALUES ($1,$2,$3)',
                [id_empresa, plan.id_plan, vu.id_hallazgo]);
            if (['DETECTADA', 'EN_ANALISIS'].includes(vu.estado_hallazgo)) {
                await cambiarEstadoVulnerabilidad(id_empresa, id_usuario, vu.id_hallazgo, 'PLANIFICADA', `Incluida en plan "${plan.nombre}"`, req.ip);
            }
        }

        await registrarAuditoria(id_empresa, id_usuario, 'REMEDIATION_CREATED', 'Remediación',
            { nombre: plan.nombre, vulnerabilidades: v.rows.map(x => x.cve_id) }, req.ip,
            { recurso: 'plan', id_recurso: plan.id_plan, descripcion: `Plan "${plan.nombre}" con ${v.rows.length} vulnerabilidad(es)` });
        if (id_remediador) {
            await crearNotificacion(id_empresa, {
                id_usuario: id_remediador, tipo: 'PLAN_ASIGNADO', titulo: `Se te asignó el plan "${plan.nombre}"`,
                mensaje: `Fecha límite: ${new Date(fecha_limite).toLocaleDateString('es-CO')}`, recurso: 'plan', id_recurso: plan.id_plan
            });
        }
        res.status(201).json(plan);
    } catch (error) {
        console.error('[ERROR CREAR PLAN]:', error.message);
        res.status(500).json({ error: 'Error al crear plan de remediación.' });
    }
};

const obtenerPlanes = async (req, res) => {
    const { id_empresa } = req.usuario;
    const params = [];
    let where = 'WHERE p.estado = TRUE';
    if (req.query.id_activo) { params.push(req.query.id_activo); where += ` AND p.id_activo = $${params.length}`; }
    try {
        const r = await queryConRLS(id_empresa, `${SELECT_PLAN} ${where} ORDER BY p.fecha_limite ASC`, params);
        res.status(200).json(r.rows);
    } catch (error) {
        console.error('[ERROR LISTAR PLANES]:', error.message);
        res.status(500).json({ error: 'Error al obtener planes.' });
    }
};

const obtenerPlanPorId = async (req, res) => {
    const { id_empresa } = req.usuario;
    try {
        const p = await queryConRLS(id_empresa, `${SELECT_PLAN} WHERE p.id_plan = $1 AND p.estado = TRUE`, [req.params.id]);
        if (p.rows.length === 0) return res.status(404).json({ error: 'Plan no encontrado.' });
        const vulns = await queryConRLS(id_empresa,
            `SELECT h.id_hallazgo, h.cve_id, h.severidad, h.cvss, h.estado_hallazgo, a.codigo_activo
             FROM plan_vulnerabilidades pv JOIN hallazgos_vuln h ON h.id_hallazgo = pv.id_hallazgo
             JOIN activos a ON a.id_activo = h.id_activo
             WHERE pv.id_plan = $1 AND pv.estado = TRUE`, [req.params.id]);
        const evid = await queryConRLS(id_empresa,
            `SELECT e.id_evidencia, e.tipo, e.comentario, e.nombre_archivo, e.fecha_creacion, u.nombre_completo AS subido_por
             FROM evidencias e LEFT JOIN usuarios u ON u.id_usuario = e.subido_por
             WHERE e.id_plan = $1 AND e.estado = TRUE ORDER BY e.fecha_creacion DESC`, [req.params.id]);
        res.status(200).json({ ...p.rows[0], vulnerabilidades: vulns.rows, evidencias: evid.rows });
    } catch (error) {
        console.error('[ERROR DETALLE PLAN]:', error.message);
        res.status(500).json({ error: 'Error al obtener el plan.' });
    }
};

const cambiarEstadoPlan = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    const estado = String(req.body.estado || '').toUpperCase();
    if (!ESTADOS_PLAN.includes(estado) || estado === 'VENCIDO') {
        return res.status(400).json({ error: 'Estado no permitido. VENCIDO solo lo asigna el sistema.' });
    }
    try {
        const actual = await queryConRLS(id_empresa, 'SELECT nombre, estado_plan FROM planes_remediacion WHERE id_plan = $1 AND estado = TRUE', [req.params.id]);
        if (actual.rows.length === 0) return res.status(404).json({ error: 'Plan no encontrado.' });

        if (estado === 'COMPLETADO') {
            const ev = await queryConRLS(id_empresa, 'SELECT 1 FROM evidencias WHERE id_plan = $1 AND estado = TRUE LIMIT 1', [req.params.id]);
            if (ev.rows.length === 0) return res.status(400).json({ error: 'Para completar el plan debe registrar al menos una evidencia.' });
        }
        const r = await queryConRLS(id_empresa,
            `UPDATE planes_remediacion SET estado_plan = $1,
                      fecha_cierre = CASE WHEN $3::text IN ('COMPLETADO','CANCELADO') THEN NOW() ELSE NULL END
               WHERE id_plan = $2 RETURNING *`, [estado, req.params.id, estado]);

        // Propagar a las vulnerabilidades del plan
        const nuevoEstadoVuln = ESTADO_VULNERABILIDAD_POR_PLAN.get(estado);
        if (nuevoEstadoVuln) {
            const vs = await queryConRLS(id_empresa,
                `SELECT h.id_hallazgo FROM plan_vulnerabilidades pv JOIN hallazgos_vuln h ON h.id_hallazgo = pv.id_hallazgo
                 WHERE pv.id_plan = $1 AND pv.estado = TRUE AND h.estado = TRUE
                   AND h.estado_hallazgo NOT IN ('CORREGIDA','CERRADA','FALSO_POSITIVO','ACEPTADA')`, [req.params.id]);
            for (const v of vs.rows) {
                await cambiarEstadoVulnerabilidad(id_empresa, id_usuario, v.id_hallazgo, nuevoEstadoVuln, `Plan "${actual.rows[0].nombre}" → ${estado}`, req.ip);
            }
        }
        await registrarAuditoria(id_empresa, id_usuario, 'REMEDIATION_STATUS_CHANGED', 'Remediación',
            { nombre: actual.rows[0].nombre, anterior: actual.rows[0].estado_plan, nuevo: estado }, req.ip,
            { recurso: 'plan', id_recurso: req.params.id, descripcion: `${actual.rows[0].estado_plan} → ${estado}` });
        res.status(200).json(r.rows[0]);
    } catch (error) {
        console.error('[ERROR ESTADO PLAN]:', error.message);
        res.status(500).json({ error: 'Error al cambiar el estado del plan.' });
    }
};

const actualizarPlan = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    const { nombre, descripcion, id_remediador, prioridad, fecha_limite } = req.body;
    try {
        const r = await queryConRLS(id_empresa,
            `UPDATE planes_remediacion SET nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion),
                    id_remediador = COALESCE($3, id_remediador), prioridad = COALESCE($4, prioridad),
                    fecha_limite = COALESCE($5, fecha_limite)
             WHERE id_plan = $6 AND estado = TRUE AND estado_plan NOT IN ('COMPLETADO','CANCELADO') RETURNING *`,
            [nombre || null, descripcion || null, id_remediador || null,
             PRIORIDADES.includes(prioridad) ? prioridad : null, fecha_limite || null, req.params.id]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Plan no encontrado o ya cerrado.' });
        await registrarAuditoria(id_empresa, id_usuario, 'REMEDIATION_UPDATED', 'Remediación',
            { cambios: req.body }, req.ip, { recurso: 'plan', id_recurso: req.params.id });
        res.status(200).json(r.rows[0]);
    } catch (error) {
        console.error('[ERROR ACTUALIZAR PLAN]:', error.message);
        res.status(500).json({ error: 'Error al actualizar el plan.' });
    }
};

// Sección 34: evidencias (comentario técnico y/o archivo)
const agregarEvidencia = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    const { comentario, tipo } = req.body;
    if (!comentario && !req.file) return res.status(400).json({ error: 'Debe incluir un comentario o un archivo.' });
    let archivoGuardado = null;
    try {
        const p = await queryConRLS(id_empresa, 'SELECT nombre FROM planes_remediacion WHERE id_plan = $1 AND estado = TRUE', [req.params.id]);
        if (p.rows.length === 0) return res.status(404).json({ error: 'Plan no encontrado.' });

        let ruta = null, nombreArchivo = null;
        if (req.file) {
            if (typeof id_empresa !== 'string' || !UUID_RE.test(id_empresa)) {
                return res.status(400).json({ error: 'Empresa no válida.' });
            }
            // El ID de empresa y el nombre de archivo se reducen a segmentos canónicos.
            const tenantId = path.basename(id_empresa);
            const dir = resolverRutaConfinada(UPLOAD_DIR, tenantId);
            if (!dir) return res.status(400).json({ error: 'Ruta de almacenamiento no válida.' });
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir permanece dentro de UPLOAD_DIR.
            fs.mkdirSync(dir, { recursive: true });
            const extensionSolicitada = path.extname(req.file.originalname).toLowerCase();
            const ext = EXTENSIONES_EVIDENCIA.has(extensionSolicitada) ? extensionSolicitada : '.bin';
            const archivo = path.basename(`${crypto.randomUUID()}${ext}`);
            archivoGuardado = resolverRutaConfinada(dir, archivo);
            if (!archivoGuardado) return res.status(400).json({ error: 'Nombre de archivo no válido.' });
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- archivoGuardado se construye dentro de dir con nombre aleatorio.
            fs.writeFileSync(archivoGuardado, req.file.buffer, { flag: 'wx' });
            ruta = path.posix.join(tenantId, archivo);
            nombreArchivo = req.file.originalname.slice(0, 250);
        }
        const r = await queryConRLS(id_empresa,
            `INSERT INTO evidencias (id_empresa, id_plan, tipo, comentario, ruta_archivo, nombre_archivo, subido_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_evidencia, tipo, comentario, nombre_archivo, fecha_creacion`,
            [id_empresa, req.params.id, req.file ? 'ARCHIVO' : (tipo || 'COMENTARIO'), comentario || null, ruta, nombreArchivo, id_usuario]);
        await registrarAuditoria(id_empresa, id_usuario, 'REMEDIATION_UPDATED', 'Remediación',
            { evidencia: nombreArchivo || 'comentario', plan: p.rows[0].nombre }, req.ip,
            { recurso: 'evidencia', id_recurso: r.rows[0].id_evidencia, descripcion: 'Evidencia agregada' });
        res.status(201).json(r.rows[0]);
    } catch (error) {
        if (archivoGuardado) fs.rmSync(archivoGuardado, { force: true });
        console.error('[ERROR EVIDENCIA]:', error.message);
        res.status(500).json({ error: 'Error al registrar la evidencia.' });
    }
};

const descargarEvidencia = async (req, res) => {
    const { id_empresa } = req.usuario;
    try {
        // RLS impide descargar evidencias de otro tenant aunque se adivine el id
        const r = await queryConRLS(id_empresa,
            'SELECT ruta_archivo, nombre_archivo FROM evidencias WHERE id_evidencia = $1 AND estado = TRUE', [req.params.idEvidencia]);
        if (r.rows.length === 0 || !r.rows[0].ruta_archivo) return res.status(404).json({ error: 'Archivo no encontrado.' });
        const rutaGuardada = r.rows[0].ruta_archivo;
        if (typeof rutaGuardada !== 'string') return res.status(404).json({ error: 'Archivo no encontrado.' });
        const segmentos = rutaGuardada.replace(/\\/g, '/').split('/');
        if (segmentos.length !== 2 || !UUID_RE.test(segmentos[0]) || !ARCHIVO_EVIDENCIA_RE.test(segmentos[1])) {
            return res.status(404).json({ error: 'Archivo no encontrado.' });
        }
        const abs = resolverRutaConfinada(UPLOAD_DIR, segmentos[0], segmentos[1]);
        if (!abs) return res.status(404).json({ error: 'Archivo no encontrado.' });
        // La ruta absoluta se valida para impedir salir de UPLOAD_DIR antes de comprobar el archivo.
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- abs está confinada a UPLOAD_DIR por la validación previa.
        if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Archivo no encontrado.' });
        res.download(abs, r.rows[0].nombre_archivo);
    } catch (error) {
        res.status(500).json({ error: 'Error al descargar la evidencia.' });
    }
};

module.exports = { crearPlan, obtenerPlanes, obtenerPlanPorId, cambiarEstadoPlan, actualizarPlan, agregarEvidencia, descargarEvidencia };
