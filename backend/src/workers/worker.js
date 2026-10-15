const startSLAWorker = require('./slaWorker');
const { pool } = require('../config/db');

const stopJobs = startSLAWorker();

const shutdown = async (signal) => {
    console.log(`[WORKER] Señal ${signal}; cerrando conexiones.`);
    stopJobs();
    await pool.end();
    process.exit(0);
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
