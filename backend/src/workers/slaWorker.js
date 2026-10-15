const cron = require('node-cron');
const { pool } = require('../config/db');
const { consultarCve } = require('../services/nvdService');
const { enviarCorreo } = require('../services/emailService');

const conBypass = async (fn) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', 'BYPASS', true)");
        const r = await fn(client);
        await client.query('COMMIT');
        return r;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};

const revisarVencimientos = () => conBypass(async (client) => {
    const { rows } = await client.query(`
        SELECT p.id_plan, p.id_empresa, p.nombre, p.fecha_limite, p.id_remediador, u.correo, u.nombre_completo
        FROM planes_remediacion p
        LEFT JOIN usuarios u ON p.id_remediador = u.id_usuario
        WHERE p.estado_plan IN ('PENDIENTE','EN_EJECUCION') AND p.fecha_limite < NOW() AND p.estado = TRUE
        FOR UPDATE OF p SKIP LOCKED`);
    for (const p of rows) {
        await client.query(`UPDATE planes_remediacion SET estado_plan = 'VENCIDO' WHERE id_plan = $1 AND id_empresa = $2`,
            [p.id_plan, p.id_empresa]);
        const fecha = new Date(p.fecha_limite).toLocaleDateString('es-CO');
        await client.query(
            `INSERT INTO eventos_auditoria (id_empresa, accion, modulo, detalles, recurso, id_recurso, resultado, descripcion, ip_origen)
             VALUES ($1,'PLAN_EXPIRED','Remediacion',$2,'plan',$3,'EXITO',$4,'sistema')`,
            [p.id_empresa, JSON.stringify({ nombre: p.nombre, fecha_limite: p.fecha_limite, sistema: true }), p.id_plan,
             `El plan "${p.nombre}" supero su fecha limite (${fecha}) y fue marcado como VENCIDO.`]);
        await client.query(
            `INSERT INTO notificaciones (id_empresa, id_usuario, tipo, titulo, mensaje, recurso, id_recurso)
             VALUES ($1, NULL, 'PLAN_VENCIDO', $2, $3, 'plan', $4)`,
            [p.id_empresa, `Plan vencido: ${p.nombre}`, `Fecha limite: ${fecha}`, p.id_plan]);

        if (p.correo) {
            await enviarCorreo(p.correo, '[VulnTrack] Alerta: Plan Vencido',
              `<h3>Plan Vencido</h3><p>Hola ${p.nombre_completo}, el plan <strong>${p.nombre}</strong> vencio el ${fecha}.</p>`);
        }
    }
    return rows.length;
});

const revisarProximos = () => conBypass(async (client) => {
    const { rows } = await client.query(`
        SELECT p.id_plan, p.id_empresa, p.nombre, p.fecha_limite, p.id_remediador, u.correo, u.nombre_completo
        FROM planes_remediacion p
        LEFT JOIN usuarios u ON p.id_remediador = u.id_usuario
        WHERE p.estado_plan IN ('PENDIENTE','EN_EJECUCION') AND p.estado = TRUE
          AND p.fecha_limite BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
          AND NOT EXISTS (SELECT 1 FROM notificaciones n WHERE n.id_recurso = p.id_plan AND n.tipo = 'PLAN_POR_VENCER')`);
    for (const p of rows) {
        const fecha = new Date(p.fecha_limite).toLocaleString('es-CO');
        await client.query(
            `INSERT INTO notificaciones (id_empresa, id_usuario, tipo, titulo, mensaje, recurso, id_recurso)
             VALUES ($1, $2, 'PLAN_POR_VENCER', $3, $4, 'plan', $5)`,
            [p.id_empresa, p.id_remediador, `Plan proximo a vencer: ${p.nombre}`,
             `Vence el ${fecha}`, p.id_plan]);
        if (p.correo) {
            await enviarCorreo(p.correo, '[VulnTrack] Alerta: Plan proximo a vencer',
              `<h3>Aviso de Vencimiento</h3><p>Hola ${p.nombre_completo}, el plan <strong>${p.nombre}</strong> vence pronto (${fecha}).</p>`);
        }
    }
    return rows.length;
});

const reintentarNVD = async () => {
    const pendientes = await conBypass(c => c.query(`
        SELECT id_hallazgo, id_empresa, cve_id FROM hallazgos_vuln
        WHERE estado_enriquecimiento = 'PENDIENTE' AND estado = TRUE AND intentos_nvd < 10
        ORDER BY intentos_nvd ASC, fecha_descubrimiento ASC LIMIT 5`).then(r => r.rows));
    let ok = 0;
    for (const v of pendientes) {
        const nvd = await consultarCve(v.cve_id);
        await conBypass(async (c) => {
            if (nvd.ok) {
                await c.query(
                    `UPDATE hallazgos_vuln SET descripcion=$1, cvss=$2, severidad=$3, fecha_publicacion_nvd=$4, referencias=$5,
                        estado_enriquecimiento='COMPLETADO', intentos_nvd = intentos_nvd + 1, fecha_actualizacion = NOW()
                     WHERE id_hallazgo=$6 AND id_empresa=$7`,
                    [nvd.descripcion, nvd.cvss, nvd.severidad, nvd.fecha_publicacion, JSON.stringify(nvd.referencias), v.id_hallazgo, v.id_empresa]);
                ok++;
            } else {
                const final = nvd.motivo === 'NO_ENCONTRADO' ? 'NO_ENCONTRADO' : 'PENDIENTE';
                await c.query(`UPDATE hallazgos_vuln SET intentos_nvd = intentos_nvd + 1, estado_enriquecimiento = $1
                               WHERE id_hallazgo = $2 AND id_empresa = $3`, [final, v.id_hallazgo, v.id_empresa]);
            }
        });
        await new Promise(r => setTimeout(r, 6500));
    }
    return { revisadas: pendientes.length, enriquecidas: ok };
};

let nvdEnCurso = false;
const startSLAWorker = () => {
    const jobs = [];
    jobs.push(cron.schedule(process.env.SLA_CRON_SCHEDULE || '* * * * *', async () => {
        try {
            const vencidos = await revisarVencimientos();
            const proximos = await revisarProximos();
            if (vencidos || proximos) console.log(`[WORKER SLA] Vencidos: ${vencidos} | Por vencer: ${proximos}`);
        } catch (e) {
            console.error('[WORKER SLA] Error:', e.message);
        }
    }));

    jobs.push(cron.schedule('*/5 * * * *', async () => {
        if (nvdEnCurso) return;
        nvdEnCurso = true;
        try {
            const r = await reintentarNVD();
            if (r.revisadas) console.log(`[WORKER NVD] Revisadas: ${r.revisadas} | Enriquecidas: ${r.enriquecidas}`);
        } catch (e) {
            console.error('[WORKER NVD] Error:', e.message);
        } finally {
            nvdEnCurso = false;
        }
    }));
    console.log('[WORKER] Monitor de SLA y reintentos NVD inicializado.');
    return () => jobs.forEach(job => job.stop());
};

module.exports = startSLAWorker;
