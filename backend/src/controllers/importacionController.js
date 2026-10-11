const ExcelJS = require('exceljs');
const { queryConRLS } = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoriaHelper');
const { crearNotificacion } = require('../utils/notificacionHelper');
const { consultarCve, esCveValido, normalizarCve } = require('../services/nvdService');
const { crearVulnerabilidad, ErrorNegocio, ESTADOS_VULN } = require('../services/vulnerabilidadService');

// ---------------------------------------------------------------- Catálogos
const COLS_ACTIVOS = ['codigo_activo', 'nombre', 'tipo', 'marca', 'modelo', 'numero_serie', 'hostname', 'direccion_ip',
    'endpoint', 'sistema_operativo', 'version_so', 'usuario_responsable', 'area', 'sede', 'estado', 'criticidad',
    'descripcion', 'fecha_adquisicion'];
const REQ_ACTIVOS = ['codigo_activo', 'nombre', 'tipo'];
const COLS_VULNS = ['codigo_activo', 'cve', 'fecha_identificacion', 'fuente', 'estado', 'observaciones'];
const REQ_VULNS = ['codigo_activo', 'cve'];

const TIPOS_ACTIVO = ['Laptop', 'Desktop', 'Servidor', 'Máquina virtual', 'Base de datos', 'API', 'Aplicación',
    'Servicio', 'Firewall', 'Switch', 'Router', 'Otro'];
const ESTADOS_ACTIVO = ['Activo', 'Inactivo', 'En mantenimiento', 'Retirado', 'Baja'];
const CRITICIDADES = { BAJA: 'BAJA', MEDIA: 'MEDIA', ALTA: 'ALTA', CRITICA: 'CRITICA' };

const MAX_FILAS = 5000;
const NVD_MAX_CONSULTAS = 25;      // NVD limita ~5 req/30s sin API key; el resto lo completa el worker
const NVD_PRESUPUESTO_MS = 60000;

const sinTildes = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const buscarEnCatalogo = (valor, catalogo) =>
    catalogo.find(c => sinTildes(c).toLowerCase() === sinTildes(valor).toLowerCase()) || null;

// Convierte cualquier tipo de celda de exceljs a texto plano
const textoCelda = (v) => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
        if (v.richText) return v.richText.map(t => t.text).join('').trim();
        if (v.text !== undefined) return String(v.text).trim();
        if (v.result !== undefined) return textoCelda(v.result);
        return '';
    }
    const s = String(v).trim();
    return s === '-' ? '' : s;
};

const fechaValida = (s) => {
    if (!s) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

const leerHoja = (hoja, columnasEsperadas) => {
    const encabezados = [];
    hoja.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
        encabezados[col] = textoCelda(cell.value).toLowerCase().replace(/\s+/g, '_');
    });
    const faltantes = columnasEsperadas.filter(c => !encabezados.includes(c));
    const filas = [];
    hoja.eachRow({ includeEmpty: false }, (row, numero) => {
        if (numero === 1) return;
        const obj = { _fila: numero };
        encabezados.forEach((h, col) => { if (h) obj[h] = textoCelda(row.getCell(col).value); });
        if (columnasEsperadas.some(c => obj[c])) filas.push(obj);   // ignora filas totalmente vacías
    });
    return { faltantes, filas };
};

// ---------------------------------------------------------------- Plantilla
const descargarPlantilla = async (req, res) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'VulnTrack';
    const estilo = (ws) => {
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        ws.columns.forEach(c => { c.width = Math.max(16, c.header.length + 4); });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
    };

    const wsA = wb.addWorksheet('Activos');
    wsA.columns = COLS_ACTIVOS.map(c => ({ header: c, key: c }));
    wsA.addRow(['LAP-001', 'Laptop Administrativa 01', 'Laptop', 'HP', 'ProBook 440 G8', 'ABC12345', 'LAP-ADM-01',
        '192.168.1.20', '', 'Windows 11', '23H2', 'Juan Pérez', 'Administración', 'Américas', 'Activo', 'Alta',
        'Equipo administrativo (FILA DE EJEMPLO: reemplácela)', '2025-02-10']);
    estilo(wsA);

    const wsV = wb.addWorksheet('Vulnerabilidades');
    wsV.columns = COLS_VULNS.map(c => ({ header: c, key: c }));
    wsV.addRow(['LAP-001', 'CVE-2021-44228', '2026-10-01', 'Auditoría', 'Detectada', 'FILA DE EJEMPLO: reemplácela']);
    estilo(wsV);

    // Validaciones de lista en Excel para reducir errores de captura
    const lista = (ws, col, valores) => {
        for (let r = 2; r <= 1000; r++) {
            ws.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${valores.join(',')}"`] };
        }
    };
    lista(wsA, 'C', TIPOS_ACTIVO);
    lista(wsA, 'O', ESTADOS_ACTIVO);
    lista(wsA, 'P', ['Baja', 'Media', 'Alta', 'Crítica']);
    lista(wsV, 'E', ['Detectada', 'En análisis', 'Aceptada', 'Falso positivo']);

    const wsI = wb.addWorksheet('Instrucciones');
    [
        ['INSTRUCCIONES DE CARGA MASIVA - VulnTrack'],
        [''],
        ['1. Hoja "Activos": un activo por fila. Obligatorios: codigo_activo, nombre, tipo.'],
        ['   Si el codigo_activo ya existe en VulnTrack, el activo se ACTUALIZA con los valores no vacíos.'],
        ['2. Hoja "Vulnerabilidades": UNA vulnerabilidad por fila. Obligatorios: codigo_activo, cve.'],
        ['   El codigo_activo debe existir (en esta misma plantilla o ya registrado en VulnTrack).'],
        ['3. La hoja "Vulnerabilidades" puede dejarse vacía para cargar solo activos.'],
        ['4. Fechas en formato AAAA-MM-DD. CVE en formato CVE-AAAA-NNNN.'],
        ['5. No se permite el mismo CVE dos veces en el mismo activo (se reporta como duplicado).'],
        ['6. Descripción, CVSS y severidad NO se escriben: VulnTrack los obtiene de NVD automáticamente.'],
        ['   Si NVD no responde, la vulnerabilidad queda "Pendiente de enriquecimiento" y se reintenta sola.'],
        ['7. Elimine las filas de ejemplo antes de cargar.'],
        [''],
        [`Tipos de activo: ${TIPOS_ACTIVO.join(', ')}`],
        [`Estados de activo: ${ESTADOS_ACTIVO.join(', ')}`],
        ['Criticidad: Baja, Media, Alta, Crítica'],
        ['Estados de vulnerabilidad al importar: Detectada, En análisis, Aceptada, Falso positivo'],
    ].forEach(r => wsI.addRow(r));
    wsI.getColumn(1).width = 110;
    wsI.getRow(1).font = { bold: true, size: 14 };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="VulnTrack_Carga_Masiva.xlsx"');
    await wb.xlsx.write(res);
    res.end();
};

// ---------------------------------------------------------------- Importación
const importar = async (req, res) => {
    const { id_empresa, id_usuario } = req.usuario;
    const errores = [];
    const resumen = {
        activos_procesados: 0, activos_creados: 0, activos_actualizados: 0,
        vulnerabilidades_procesadas: 0, vulnerabilidades_creadas: 0, duplicadas: 0, con_errores: 0,
        pendientes_enriquecimiento: 0
    };
    const err = (hoja, fila, mensaje) => errores.push({ hoja, fila, mensaje });

    // 1-2. Archivo y formato
    if (!req.file) return res.status(400).json({ error: 'Debe adjuntar el archivo VulnTrack_Carga_Masiva.xlsx.' });
    if (!/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Formato no permitido. Solo se acepta .xlsx.' });

    const wb = new ExcelJS.Workbook();
    try {
        await wb.xlsx.load(req.file.buffer);
    } catch {
        return res.status(400).json({ error: 'El archivo está dañado o no es un Excel válido.' });
    }

    // 3-4. Hojas y columnas
    const hojaA = wb.getWorksheet('Activos');
    const hojaV = wb.getWorksheet('Vulnerabilidades');
    if (!hojaA || !hojaV) {
        return res.status(400).json({ error: 'El archivo debe contener las hojas "Activos" y "Vulnerabilidades". Descargue la plantilla oficial.' });
    }
    const A = leerHoja(hojaA, COLS_ACTIVOS);
    const V = leerHoja(hojaV, COLS_VULNS);
    const faltanA = A.faltantes.filter(c => REQ_ACTIVOS.includes(c));
    const faltanV = V.faltantes.filter(c => REQ_VULNS.includes(c));
    if (faltanA.length || faltanV.length) {
        return res.status(400).json({ error: `Columnas obligatorias faltantes. Activos: [${faltanA.join(', ')}] Vulnerabilidades: [${faltanV.join(', ')}]` });
    }
    if (A.filas.length + V.filas.length === 0) return res.status(400).json({ error: 'El archivo no contiene datos.' });
    if (A.filas.length > MAX_FILAS || V.filas.length > MAX_FILAS) {
        return res.status(400).json({ error: `Máximo ${MAX_FILAS} filas por hoja.` });
    }

    try {
        // 5-6. Activos: validar y crear/actualizar (upsert por codigo_activo)
        const vistosA = new Set();
        for (const f of A.filas) {
            resumen.activos_procesados++;
            const codigo = f.codigo_activo?.toUpperCase();
            const faltan = REQ_ACTIVOS.filter(c => !f[c]);
            if (faltan.length) { err('Activos', f._fila, `Campo obligatorio vacío: ${faltan.join(', ')}`); continue; }
            if (vistosA.has(codigo)) { err('Activos', f._fila, `codigo_activo ${codigo} repetido dentro del archivo`); continue; }
            vistosA.add(codigo);

            const tipo = buscarEnCatalogo(f.tipo, TIPOS_ACTIVO);
            if (!tipo) { err('Activos', f._fila, `Tipo no permitido: "${f.tipo}"`); continue; }
            const estado = f.estado ? buscarEnCatalogo(f.estado, ESTADOS_ACTIVO) : null;
            if (f.estado && !estado) { err('Activos', f._fila, `Estado no permitido: "${f.estado}"`); continue; }
            const crit = f.criticidad ? CRITICIDADES[sinTildes(f.criticidad).toUpperCase()] : null;
            if (f.criticidad && !crit) { err('Activos', f._fila, `Criticidad no permitida: "${f.criticidad}"`); continue; }
            if (!fechaValida(f.fecha_adquisicion)) { err('Activos', f._fila, `Fecha inválida (use AAAA-MM-DD): "${f.fecha_adquisicion}"`); continue; }
            if (f.direccion_ip && !/^[0-9a-fA-F:.\/]+$/.test(f.direccion_ip)) { err('Activos', f._fila, `Dirección IP inválida: "${f.direccion_ip}"`); continue; }

            const v = (k) => f[k] ? f[k].slice(0, 250) : null;

            try {
                // Busca el activo por (id_empresa, codigo_activo) SIN filtrar por estado: el constraint
                // UNIQUE uq_codigo_activo tampoco filtra por estado, así que un codigo_activo soft-deleted
                // (estado = FALSE) debe detectarse aquí para reactivarlo en vez de reinsertar y colisionar.
                const existente = await queryConRLS(id_empresa,
                    'SELECT id_activo, estado FROM activos WHERE codigo_activo = $1', [codigo]);

                if (existente.rows.length) {
                    // Activo existente (activo o soft-deleted): se actualiza y, si estaba soft-deleted, se reactiva (estado = TRUE).
                    await queryConRLS(id_empresa,
                        `UPDATE activos SET nombre=$1, tipo=$2, marca=COALESCE($3,marca), modelo=COALESCE($4,modelo),
                            numero_serie=COALESCE($5,numero_serie), hostname=COALESCE($6,hostname), direccion_ip=COALESCE($7,direccion_ip),
                            endpoint=COALESCE($8,endpoint), sistema_operativo=COALESCE($9,sistema_operativo), version_so=COALESCE($10,version_so),
                            usuario_responsable=COALESCE($11,usuario_responsable), area=COALESCE($12,area), sede=COALESCE($13,sede),
                            estado_activo=COALESCE($14,estado_activo), criticidad=COALESCE($15,criticidad), descripcion=COALESCE($16,descripcion),
                            fecha_adquisicion=COALESCE($17,fecha_adquisicion), estado=TRUE
                         WHERE id_activo=$18`,
                        [v('nombre'), tipo, v('marca'), v('modelo'), v('numero_serie'), v('hostname'), v('direccion_ip'), v('endpoint'),
                         v('sistema_operativo'), v('version_so'), v('usuario_responsable'), v('area'), v('sede'), estado, crit,
                         f.descripcion || null, f.fecha_adquisicion || null, existente.rows[0].id_activo]);
                    resumen.activos_actualizados++;
                    await registrarAuditoria(id_empresa, id_usuario, 'ASSET_UPDATED', 'Activos', { codigo_activo: codigo, origen: 'EXCEL' }, req.ip,
                        { recurso: 'activo', id_recurso: existente.rows[0].id_activo });
                } else {
                    const ins = await queryConRLS(id_empresa,
                        `INSERT INTO activos (id_empresa, codigo_activo, nombre, tipo, marca, modelo, numero_serie, hostname, direccion_ip,
                            endpoint, sistema_operativo, version_so, usuario_responsable, propietario, area, sede, estado_activo, criticidad,
                            descripcion, fecha_adquisicion)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16,$17,$18,$19) RETURNING id_activo`,
                        [id_empresa, codigo, v('nombre'), tipo, v('marca'), v('modelo'), v('numero_serie'), v('hostname'), v('direccion_ip'),
                         v('endpoint'), v('sistema_operativo'), v('version_so'), v('usuario_responsable'), v('area'), v('sede'),
                         estado || 'Activo', crit || 'MEDIA', f.descripcion || null, f.fecha_adquisicion || null]);
                    resumen.activos_creados++;
                    await registrarAuditoria(id_empresa, id_usuario, 'ASSET_CREATED', 'Activos', { codigo_activo: codigo, origen: 'EXCEL' }, req.ip,
                        { recurso: 'activo', id_recurso: ins.rows[0].id_activo });
                }
            } catch (e) {
                // Defensa en profundidad: un fallo de BD en una fila (p. ej. colisión 23505 no contemplada)
                // no debe abortar toda la importación con 500. Se reporta la fila y se continúa.
                if (e.code === '23505') err('Activos', f._fila, `codigo_activo ${codigo} duplicado`);
                else err('Activos', f._fila, `No se pudo procesar el activo: ${e.message}`);
            }
        }

        // 7-12. Vulnerabilidades
        const mapaActivos = new Map();
        (await queryConRLS(id_empresa, 'SELECT id_activo, codigo_activo FROM activos WHERE estado = TRUE'))
            .rows.forEach(r => mapaActivos.set(String(r.codigo_activo).toUpperCase(), r.id_activo));

        // Caché + presupuesto de consultas a NVD durante la importación
        const cache = new Map();
        const inicio = Date.now();
        let consultas = 0;
        const nvdLookup = async (cve) => {
            if (cache.has(cve)) return cache.get(cve);
            if (consultas >= NVD_MAX_CONSULTAS || Date.now() - inicio > NVD_PRESUPUESTO_MS) {
                return { ok: false, motivo: 'DIFERIDO' };   // lo completa el worker de reintentos
            }
            consultas++;
            const r = await consultarCve(cve);
            cache.set(cve, r);
            return r;
        };

        const vistosV = new Set();
        let criticas = 0;
        for (const f of V.filas) {
            resumen.vulnerabilidades_procesadas++;
            const codigo = f.codigo_activo?.toUpperCase();
            const cve = normalizarCve(f.cve);
            const faltan = REQ_VULNS.filter(c => !f[c]);
            if (faltan.length) { resumen.con_errores++; err('Vulnerabilidades', f._fila, `Campo obligatorio vacío: ${faltan.join(', ')}`); continue; }
            if (!esCveValido(cve)) { resumen.con_errores++; err('Vulnerabilidades', f._fila, `CVE inválido: "${f.cve}"`); continue; }
            const id_activo = mapaActivos.get(codigo);
            if (!id_activo) { resumen.con_errores++; err('Vulnerabilidades', f._fila, `El código de activo ${codigo} no existe.`); continue; }
            if (!fechaValida(f.fecha_identificacion)) { resumen.con_errores++; err('Vulnerabilidades', f._fila, `Fecha inválida: "${f.fecha_identificacion}"`); continue; }
            const clave = `${codigo}|${cve}`;
            if (vistosV.has(clave)) { resumen.duplicadas++; err('Vulnerabilidades', f._fila, `Duplicada dentro del archivo: ${codigo} + ${cve}`); continue; }
            vistosV.add(clave);

            const estado = f.estado ? sinTildes(f.estado).toUpperCase().replace(/\s+/g, '_') : 'DETECTADA';
            if (!ESTADOS_VULN.includes(estado)) { resumen.con_errores++; err('Vulnerabilidades', f._fila, `Estado no permitido: "${f.estado}"`); continue; }

            try {
                const vuln = await crearVulnerabilidad(id_empresa, id_usuario, {
                    id_activo, cve_id: cve, fecha_identificacion: f.fecha_identificacion || null,
                    fuente: f.fuente || 'Carga masiva', estado, observaciones: f.observaciones || null, source_type: 'EXCEL'
                }, { nvdLookup, ip: req.ip, notificar: false });
                resumen.vulnerabilidades_creadas++;
                if (vuln.estado_enriquecimiento === 'PENDIENTE') resumen.pendientes_enriquecimiento++;
                if (vuln.severidad === 'CRITICA') criticas++;
            } catch (e) {
                if (e.duplicado) { resumen.duplicadas++; err('Vulnerabilidades', f._fila, e.message); }
                else if (e instanceof ErrorNegocio) { resumen.con_errores++; err('Vulnerabilidades', f._fila, e.message); }
                else throw e;
            }
        }

        // 13. Auditoría y notificación de resumen
        await registrarAuditoria(id_empresa, id_usuario, 'BULK_IMPORT_COMPLETED', 'Carga masiva',
            { archivo: req.file.originalname, ...resumen, errores: errores.length }, req.ip,
            { recurso: 'importacion', resultado: errores.length ? 'PARCIAL' : 'EXITO',
              descripcion: `Activos ${resumen.activos_creados}+${resumen.activos_actualizados}, vulnerabilidades ${resumen.vulnerabilidades_creadas}` });
        if (criticas > 0) {
            await crearNotificacion(id_empresa, {
                tipo: 'VULN_CRITICA', titulo: `Carga masiva: ${criticas} vulnerabilidad(es) crítica(s)`,
                mensaje: `Importadas desde ${req.file.originalname}.`, recurso: 'importacion'
            });
        }

        // 14. Resumen
        res.status(200).json({ resumen, errores });
    } catch (error) {
        console.error('[ERROR IMPORTACION]:', error);
        res.status(500).json({ error: 'Error interno durante la importación. Revise el resumen parcial.', resumen, errores });
    }
};

module.exports = { descargarPlantilla, importar };
