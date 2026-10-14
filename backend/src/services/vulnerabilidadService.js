const { queryConRLS } = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoriaHelper');
const { crearNotificacion } = require('../utils/notificacionHelper');
const { consultarCve, esCveValido, normalizarCve } = require('./nvdService');

const ESTADOS_VULN = ['DETECTADA', 'EN_ANALISIS', 'PLANIFICADA', 'EN_REMEDIACION', 'MITIGADA', 'CORREGIDA', 'ACEPTADA', 'FALSO_POSITIVO', 'CERRADA'];
const ESTADOS_ABIERTOS = ['DETECTADA', 'EN_ANALISIS', 'PLANIFICADA', 'EN_REMEDIACION'];
const SOURCE_TYPES = ['MANUAL', 'EXCEL', 'NESSUS', 'OPENVAS', 'WAZUH', 'QUALYS', 'RAPID7', 'API'];

class ErrorNegocio extends Error {
    constructor(mensaje, codigo = 400) { super(mensaje); this.codigo = codigo; }
}

/**
 * Crea una vulnerabilidad aplicando todas las reglas de negocio.
 * Reutilizado por el registro manual y por la importación masiva.
 * @param {object} opciones - { nvdCache: Map, ip, notificar }
 * @returns {object} vulnerabilidad creada
 */
const crearVulnerabilidad = async (id_empresa, id_usuario, datos, opciones = {}) => {
    // nvdLookup permite a la importación masiva usar caché + presupuesto de consultas
    const { nvdLookup = consultarCve, ip = '127.0.0.1', notificar = true } = opciones;
    const cve_id = normalizarCve(datos.cve_id);

    // Regla: CVE obligatorio y con formato válido
    if (!cve_id) throw new ErrorNegocio('El CVE es obligatorio.');
    if (!esCveValido(cve_id)) throw new ErrorNegocio(`CVE inválido: "${datos.cve_id}". Formato esperado CVE-AAAA-NNNN.`);

    // Regla 2: debe estar asociada a un activo existente del mismo tenant (RLS lo garantiza)
    if (!datos.id_activo) throw new ErrorNegocio('La vulnerabilidad debe estar asociada a un activo.');
    const activo = await queryConRLS(id_empresa,
        'SELECT id_activo, codigo_activo, nombre, criticidad FROM activos WHERE id_activo = $1 AND estado = TRUE', [datos.id_activo]);
    if (activo.rows.length === 0) throw new ErrorNegocio('El activo indicado no existe.', 404);

    // Regla 4: no duplicar activo + CVE
    const dup = await queryConRLS(id_empresa,
        'SELECT id_hallazgo FROM hallazgos_vuln WHERE id_activo = $1 AND cve_id = $2', [datos.id_activo, cve_id]);
    if (dup.rows.length > 0) {
        const e = new ErrorNegocio(`El activo ${activo.rows[0].codigo_activo} ya tiene registrada la vulnerabilidad ${cve_id}.`, 409);
        e.duplicado = true;
        throw e;
    }

    const estado = datos.estado ? String(datos.estado).toUpperCase().replace(/\s+/g, '_') : 'DETECTADA';
    if (!ESTADOS_VULN.includes(estado)) throw new ErrorNegocio(`Estado no permitido: "${datos.estado}".`);

    const source_type = SOURCE_TYPES.includes(String(datos.source_type || '').toUpperCase())
        ? String(datos.source_type).toUpperCase() : 'MANUAL';

    // Enriquecimiento NVD (Sección 24). Si falla, se registra igual como PENDIENTE (Sección 26).
    const nvd = await nvdLookup(cve_id);

    const result = await queryConRLS(id_empresa,
        `INSERT INTO hallazgos_vuln (
            id_empresa, id_activo, cve_id, titulo, descripcion, severidad, cvss, estado_hallazgo, id_auditor,
            fecha_identificacion, fuente, source_type, external_id, observaciones,
            estado_enriquecimiento, fecha_publicacion_nvd, referencias, intentos_nvd
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,1)
         RETURNING *`,
        [
            id_empresa, datos.id_activo, cve_id, cve_id,
            nvd.ok ? nvd.descripcion : null,
            nvd.ok ? nvd.severidad : null,
            nvd.ok ? nvd.cvss : null,
            estado, id_usuario,
            datos.fecha_identificacion || new Date().toISOString().slice(0, 10),
            datos.fuente || (source_type === 'EXCEL' ? 'Carga masiva' : 'Manual'),
            source_type, datos.external_id || null, datos.observaciones || null,
            nvd.ok ? 'COMPLETADO' : 'PENDIENTE',
            nvd.ok ? nvd.fecha_publicacion : null,
            JSON.stringify(nvd.ok ? nvd.referencias : [])
        ]
    );
    const vuln = result.rows[0];

    // -- EVALUACION DE RIESGOS AUTOMATICA --
    let imp = 2; // BAJA
    const crit = activo.rows[0].criticidad || 'BAJA';
    if (crit === 'CRITICA') imp = 5;
    else if (crit === 'ALTA') imp = 4;
    else if (crit === 'MEDIA') imp = 3;

    let prob = 2;
    const cvssNum = nvd.ok && nvd.cvss ? parseFloat(nvd.cvss) : 0;
    if (cvssNum >= 9) prob = 5;
    else if (cvssNum >= 7) prob = 4;
    else if (cvssNum >= 4) prob = 3;

    await queryConRLS(id_empresa,
        `INSERT INTO riesgos (id_empresa, id_hallazgo, probabilidad, impacto, justificacion, evaluado_por)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id_empresa, vuln.id_hallazgo, prob, imp, 'Auto-Evaluación (Criticidad: ' + crit + ', CVSS: ' + cvssNum + ')', id_usuario]
    );

    await queryConRLS(id_empresa,
        `INSERT INTO historial_vulnerabilidad (id_empresa, id_hallazgo, estado_anterior, estado_nuevo, comentario, id_usuario)
         VALUES ($1, $2, NULL, $3, $4, $5)`,
        [id_empresa, vuln.id_hallazgo, estado, `Registrada (${vuln.fuente})`, id_usuario]);

    await registrarAuditoria(id_empresa, id_usuario, 'VULNERABILITY_CREATED', 'Vulnerabilidades',
        { cve_id, codigo_activo: activo.rows[0].codigo_activo, fuente: vuln.fuente, nvd: nvd.ok ? 'OK' : nvd.motivo }, ip,
        { recurso: 'vulnerabilidad', id_recurso: vuln.id_hallazgo,
          descripcion: `${cve_id} registrada en ${activo.rows[0].codigo_activo}` });

    if (notificar && vuln.severidad === 'CRITICA') {
        await crearNotificacion(id_empresa, {
            tipo: 'VULN_CRITICA',
            titulo: `Nueva vulnerabilidad crítica: ${cve_id}`,
            mensaje: `Registrada en ${activo.rows[0].codigo_activo} - ${activo.rows[0].nombre} (CVSS ${vuln.cvss}).`,
            recurso: 'vulnerabilidad', id_recurso: vuln.id_hallazgo
        });
    }
    return vuln;
};

/**
 * Cambia el estado dejando historial + auditoría (Sección 27).
 */
const cambiarEstadoVulnerabilidad = async (id_empresa, id_usuario, id_hallazgo, nuevoEstado, comentario, ip) => {
    const estado = String(nuevoEstado || '').toUpperCase();
    if (!ESTADOS_VULN.includes(estado)) throw new ErrorNegocio(`Estado no permitido: "${nuevoEstado}".`);

    const actual = await queryConRLS(id_empresa,
        'SELECT id_hallazgo, cve_id, estado_hallazgo FROM hallazgos_vuln WHERE id_hallazgo = $1 AND estado = TRUE', [id_hallazgo]);
    if (actual.rows.length === 0) throw new ErrorNegocio('Vulnerabilidad no encontrada.', 404);
    const anterior = actual.rows[0].estado_hallazgo;
    if (anterior === estado) return actual.rows[0];

    const upd = await queryConRLS(id_empresa,
        `UPDATE hallazgos_vuln SET estado_hallazgo = $1, fecha_actualizacion = NOW() WHERE id_hallazgo = $2 RETURNING *`,
        [estado, id_hallazgo]);
    await queryConRLS(id_empresa,
        `INSERT INTO historial_vulnerabilidad (id_empresa, id_hallazgo, estado_anterior, estado_nuevo, comentario, id_usuario)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id_empresa, id_hallazgo, anterior, estado, comentario || null, id_usuario]);
    await registrarAuditoria(id_empresa, id_usuario, 'VULNERABILITY_STATUS_CHANGED', 'Vulnerabilidades',
        { cve_id: actual.rows[0].cve_id, anterior, nuevo: estado }, ip,
        { recurso: 'vulnerabilidad', id_recurso: id_hallazgo, descripcion: `${anterior} → ${estado}` });

    if (estado === 'CORREGIDA') {
        await crearNotificacion(id_empresa, {
            tipo: 'VULN_CORREGIDA', titulo: `Vulnerabilidad corregida: ${actual.rows[0].cve_id}`,
            recurso: 'vulnerabilidad', id_recurso: id_hallazgo
        });
    }
    return upd.rows[0];
};

module.exports = { crearVulnerabilidad, cambiarEstadoVulnerabilidad, ErrorNegocio, ESTADOS_VULN, ESTADOS_ABIERTOS };
