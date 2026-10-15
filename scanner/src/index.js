const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const target = process.env.SCAN_TARGET || '/scan-target';
const outputDir = process.env.SCAN_OUTPUT_DIR || '/var/logs/scanner';
const reportPath = path.join(outputDir, 'latest.json');
const intervalMs = Math.max(300000, Number(process.env.SCAN_INTERVAL_MS) || 21600000);
const runOnce = process.env.SCAN_RUN_ONCE === 'true';
let timer;
let running = false;

const runScan = async () => {
    if (running) return;
    running = true;
    fs.mkdirSync(outputDir, { recursive: true });
    try {
        const response = await fetch(`${(process.env.API_URL || 'http://securehub-api:3000').replace(/\/$/, '')}/health`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        console.log('[SCANNER] API disponible.');
    } catch (error) {
        console.warn(`[SCANNER] API no disponible durante el análisis: ${error.message}`);
    }
    console.log(`[SCANNER] Iniciando Trivy fs scan: ${target}`);

    const args = [
        'fs', '--scanners', 'vuln', '--severity', 'HIGH,CRITICAL',
        '--format', 'json', '--output', reportPath,
        '--skip-dirs', path.join(target, '.git'),
        '--skip-dirs', path.join(target, 'backend/node_modules'),
        '--skip-dirs', path.join(target, 'frontend/node_modules'),
        '--skip-dirs', path.join(target, 'frontend/dist'),
        '--skip-dirs', path.join(target, 'deploy/terraform/.terraform'),
        target,
    ];
    const child = spawn('trivy', args, { stdio: 'inherit' });

    child.once('error', (error) => {
        console.error(`[SCANNER] No se pudo iniciar Trivy: ${error.message}`);
        running = false;
        if (runOnce) process.exitCode = 1;
    });
    child.once('close', (code) => {
        if (code !== 0) {
            console.error(`[SCANNER] Trivy terminó con código ${code}; se conserva el informe anterior si existe.`);
        } else {
            try {
                const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                const results = report.Results || [];
                const findings = results.reduce((count, result) => (
                    count + (result.Vulnerabilities || []).length + (result.Misconfigurations || []).length
                ), 0);
                console.log(`[SCANNER] Análisis completado: ${findings} hallazgos HIGH/CRITICAL; informe ${reportPath}`);
            } catch (error) {
                console.error(`[SCANNER] Informe JSON inválido: ${error.message}`);
                if (runOnce) process.exitCode = 1;
            }
        }
        running = false;
        if (runOnce && code !== 0) process.exitCode = 1;
    });
};

const stop = () => {
    if (timer) clearInterval(timer);
};

process.once('SIGTERM', stop);
process.once('SIGINT', stop);
void runScan();
if (!runOnce) timer = setInterval(() => void runScan(), intervalMs);
