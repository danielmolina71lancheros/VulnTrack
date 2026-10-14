/**
 * Servicio de enriquecimiento NVD (Secciones 24-26).
 * NVD NO detecta vulnerabilidades: solo aporta información sobre un CVE ya identificado.
 * Si NVD falla, se devuelve { ok:false } y el registro continúa como "PENDIENTE" de enriquecimiento.
 */
const CVE_REGEX = /^CVE-\d{4}-\d{4,}$/i;

const SEVERIDAD_MAP = { CRITICAL: 'CRITICA', HIGH: 'ALTA', MEDIUM: 'MEDIA', LOW: 'BAJA', NONE: 'NINGUNA' };

const esCveValido = (cve) => typeof cve === 'string' && CVE_REGEX.test(cve.trim());

const normalizarCve = (cve) => (cve || '').toString().trim().toUpperCase();

const consultarCve = async (cve, timeoutMs = 8000) => {
    const id = normalizarCve(cve);
    if (!esCveValido(id)) return { ok: false, motivo: 'FORMATO_INVALIDO' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers = {};
        if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;

        const resp = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${id}`, {
            headers, signal: controller.signal
        });
        if (!resp.ok) return { ok: false, motivo: `HTTP_${resp.status}` };

        const data = await resp.json();
        if (!data.vulnerabilities || data.vulnerabilities.length === 0) {
            return { ok: false, motivo: 'NO_ENCONTRADO' };
        }
        const cveData = data.vulnerabilities[0].cve;
        const descripcion = cveData.descriptions?.find(d => d.lang === 'es')?.value
            || cveData.descriptions?.find(d => d.lang === 'en')?.value || null;

        const m = cveData.metrics || {};
        const metrica = m.cvssMetricV31?.[0]?.cvssData || m.cvssMetricV30?.[0]?.cvssData || null;
        const metricaV2 = m.cvssMetricV2?.[0];
        const cvss = metrica?.baseScore ?? metricaV2?.cvssData?.baseScore ?? null;
        const sevIngles = metrica?.baseSeverity || metricaV2?.baseSeverity || null;

        return {
            ok: true,
            cve_id: cveData.id,
            descripcion,
            cvss,
            severidad: sevIngles ? (SEVERIDAD_MAP[sevIngles.toUpperCase()] || null) : null,
            fecha_publicacion: cveData.published || null,
            referencias: (cveData.references || []).slice(0, 15).map(r => r.url)
        };
    } catch (error) {
        return { ok: false, motivo: error.name === 'AbortError' ? 'TIMEOUT' : 'ERROR_RED' };
    } finally {
        clearTimeout(timer);
    }
};

module.exports = { consultarCve, esCveValido, normalizarCve };
