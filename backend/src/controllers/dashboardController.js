const { queryConRLS } = require('../config/db');

const obtenerMetricas = async (req, res) => {
    const { id_empresa } = req.usuario;
    const { id_activo } = req.query;

    let activoFilterActivos = '';
    let activoFilterHallazgos = '';
    let activoFilterPlanes = '';
    let paramsActivos = [];
    let paramsHallazgos = [];
    let paramsPlanes = [];

    if (id_activo) {
        activoFilterActivos = ' AND id_activo = $1';
        activoFilterHallazgos = ' AND id_activo = $1';
        activoFilterPlanes = ' AND id_activo = $1';
        paramsActivos.push(id_activo);
        paramsHallazgos.push(id_activo);
        paramsPlanes.push(id_activo);
    }

    try {
        const activosRes = await queryConRLS(id_empresa, 
            'SELECT COUNT(*) as total FROM activos WHERE estado = TRUE' + activoFilterActivos, paramsActivos
        );
        const totalActivos = parseInt(activosRes.rows[0].total, 10);

        const severidadRes = await queryConRLS(id_empresa, 
            'SELECT severidad, COUNT(*) as cantidad FROM hallazgos_vuln WHERE estado = TRUE ' + activoFilterHallazgos + ' GROUP BY severidad', paramsHallazgos
        );
        const hallazgosPorSeveridad = severidadRes.rows;

        const remediacionRes = await queryConRLS(id_empresa, 
            'SELECT estado_plan, COUNT(*) as cantidad FROM planes_remediacion WHERE estado = TRUE ' + activoFilterPlanes + ' GROUP BY estado_plan', paramsPlanes
        );
        const planesPorEstado = remediacionRes.rows;

        const topHallazgosRes = await queryConRLS(id_empresa, 
            'SELECT titulo, severidad, estado_hallazgo, fecha_descubrimiento FROM hallazgos_vuln WHERE estado = TRUE AND severidad IN (\'CRITICA\', \'ALTA\') ' + activoFilterHallazgos + ' ORDER BY fecha_descubrimiento DESC LIMIT 5', paramsHallazgos
        );
        const alertasRecientes = topHallazgosRes.rows;

        // Ensamblar y enviar el JSON consolidado
        res.status(200).json({
            metricas_generales: {
                total_activos: totalActivos
            },
            graficas: {
                hallazgos_severidad: hallazgosPorSeveridad,
                estado_remediacion: planesPorEstado
            },
            alertas_recientes: alertasRecientes
        });

    } catch (error) {
        console.error("[ERROR DASHBOARD]:", error.message);
        res.status(500).json({ error: "Fallo interno al generar métricas del Dashboard." });
    }
};

module.exports = { obtenerMetricas };
