-- =====================================================================
-- VulnTrack - Migración v3 (Especificación funcional completa)
-- =====================================================================
BEGIN;

-- ---------- ACTIVOS (Sección 12) ----------
ALTER TABLE activos ADD COLUMN IF NOT EXISTS usuario_responsable VARCHAR(150);
UPDATE activos SET usuario_responsable = propietario WHERE usuario_responsable IS NULL;
ALTER TABLE activos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE activos ADD COLUMN IF NOT EXISTS deleted_by UUID;
-- Estados del activo (Sección 13)
ALTER TABLE activos DROP CONSTRAINT IF EXISTS chk_estado_activo;
ALTER TABLE activos ADD CONSTRAINT chk_estado_activo
  CHECK (estado_activo IN ('Activo','Inactivo','En mantenimiento','Retirado','Baja'));

-- ---------- VULNERABILIDADES (Secciones 23, 26, 27, 52) ----------
ALTER TABLE hallazgos_vuln ALTER COLUMN titulo DROP NOT NULL;
ALTER TABLE hallazgos_vuln ALTER COLUMN descripcion DROP NOT NULL;
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS fecha_identificacion DATE DEFAULT CURRENT_DATE;
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'MANUAL';
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS external_id VARCHAR(150);
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS estado_enriquecimiento VARCHAR(30) DEFAULT 'PENDIENTE';
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS fecha_publicacion_nvd TIMESTAMP;
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS referencias JSONB DEFAULT '[]'::jsonb;
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS intentos_nvd INT DEFAULT 0;
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE hallazgos_vuln ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE hallazgos_vuln ALTER COLUMN id_activo SET NOT NULL;   -- Regla 2

-- Estados oficiales de la especificación (Sección 27)
ALTER TABLE hallazgos_vuln DROP CONSTRAINT IF EXISTS hallazgos_vuln_estado_hallazgo_check;
UPDATE hallazgos_vuln SET estado_hallazgo = CASE estado_hallazgo
    WHEN 'ABIERTO' THEN 'DETECTADA'
    WHEN 'EN_PROCESO' THEN 'EN_REMEDIACION'
    WHEN 'MITIGADO' THEN 'MITIGADA'
    ELSE estado_hallazgo END;
ALTER TABLE hallazgos_vuln ADD CONSTRAINT hallazgos_vuln_estado_hallazgo_check CHECK (estado_hallazgo IN
  ('DETECTADA','EN_ANALISIS','PLANIFICADA','EN_REMEDIACION','MITIGADA','CORREGIDA','ACEPTADA','FALSO_POSITIVO','CERRADA'));
ALTER TABLE hallazgos_vuln ALTER COLUMN estado_hallazgo SET DEFAULT 'DETECTADA';
-- Severidad puede quedar sin dato mientras NVD está pendiente
ALTER TABLE hallazgos_vuln DROP CONSTRAINT IF EXISTS hallazgos_vuln_severidad_check;
ALTER TABLE hallazgos_vuln ADD CONSTRAINT hallazgos_vuln_severidad_check
  CHECK (severidad IS NULL OR severidad IN ('BAJA','MEDIA','ALTA','CRITICA','NINGUNA'));
UPDATE hallazgos_vuln SET estado_enriquecimiento = 'COMPLETADO' WHERE cvss IS NOT NULL;

-- Historial de estados de la vulnerabilidad (Sección 27: "Cada cambio debe quedar registrado")
CREATE TABLE IF NOT EXISTS historial_vulnerabilidad (
    id_historial UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    id_hallazgo UUID NOT NULL REFERENCES hallazgos_vuln(id_hallazgo),
    estado_anterior VARCHAR(30),
    estado_nuevo VARCHAR(30) NOT NULL,
    comentario TEXT,
    id_usuario UUID REFERENCES usuarios(id_usuario),
    fecha TIMESTAMP DEFAULT NOW()
);
ALTER TABLE historial_vulnerabilidad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislar_historial_vuln ON historial_vulnerabilidad;
CREATE POLICY aislar_historial_vuln ON historial_vulnerabilidad USING (
  current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));

-- ---------- RIESGO NUMÉRICO 1-5 (Secciones 29, 30) ----------
ALTER TABLE riesgos DROP CONSTRAINT IF EXISTS riesgos_impacto_check;
ALTER TABLE riesgos DROP CONSTRAINT IF EXISTS riesgos_probabilidad_check;
ALTER TABLE riesgos ALTER COLUMN probabilidad TYPE INT USING (CASE probabilidad
    WHEN 'BAJA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'ALTA' THEN 4 WHEN 'MUY_ALTA' THEN 5 ELSE 3 END);
ALTER TABLE riesgos ALTER COLUMN impacto TYPE INT USING (CASE impacto
    WHEN 'BAJO' THEN 2 WHEN 'MEDIO' THEN 3 WHEN 'ALTO' THEN 4 WHEN 'CRITICO' THEN 5 ELSE 3 END);
ALTER TABLE riesgos ADD CONSTRAINT riesgos_probabilidad_check CHECK (probabilidad BETWEEN 1 AND 5);
ALTER TABLE riesgos ADD CONSTRAINT riesgos_impacto_check CHECK (impacto BETWEEN 1 AND 5);
-- Puntaje y clasificación calculados por la BD: imposible que queden inconsistentes
ALTER TABLE riesgos DROP COLUMN IF EXISTS riesgo_global;
ALTER TABLE riesgos ADD COLUMN puntaje INT GENERATED ALWAYS AS (probabilidad * impacto) STORED;
ALTER TABLE riesgos ADD COLUMN clasificacion VARCHAR(10) GENERATED ALWAYS AS (
  CASE WHEN probabilidad * impacto >= 17 THEN 'CRITICO'
       WHEN probabilidad * impacto >= 10 THEN 'ALTO'
       WHEN probabilidad * impacto >= 5  THEN 'MEDIO'
       ELSE 'BAJO' END) STORED;
ALTER TABLE riesgos ADD COLUMN IF NOT EXISTS justificacion TEXT;
ALTER TABLE riesgos ADD COLUMN IF NOT EXISTS evaluado_por UUID REFERENCES usuarios(id_usuario);
ALTER TABLE riesgos ADD COLUMN IF NOT EXISTS fecha_evaluacion TIMESTAMP DEFAULT NOW();
-- Una evaluación vigente por vulnerabilidad
UPDATE riesgos r SET estado = FALSE WHERE estado = TRUE AND EXISTS (
  SELECT 1 FROM riesgos r2 WHERE r2.id_hallazgo = r.id_hallazgo AND r2.estado = TRUE AND r2.id_riesgo > r.id_riesgo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_riesgo_vigente ON riesgos (id_hallazgo) WHERE estado = TRUE;

-- ---------- PLANES DE REMEDIACIÓN (Secciones 32, 33) ----------
ALTER TABLE planes_remediacion DROP CONSTRAINT IF EXISTS planes_remediacion_estado_plan_check;
UPDATE planes_remediacion SET estado_plan = 'EN_EJECUCION' WHERE estado_plan = 'EN_PROCESO';
ALTER TABLE planes_remediacion ADD CONSTRAINT planes_remediacion_estado_plan_check
  CHECK (estado_plan IN ('PENDIENTE','EN_EJECUCION','COMPLETADO','VENCIDO','CANCELADO'));
ALTER TABLE planes_remediacion ADD COLUMN IF NOT EXISTS fecha_inicio DATE DEFAULT CURRENT_DATE;
ALTER TABLE planes_remediacion ADD COLUMN IF NOT EXISTS id_activo UUID REFERENCES activos(id_activo);
ALTER TABLE planes_remediacion ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES usuarios(id_usuario);
ALTER TABLE planes_remediacion ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMP;
ALTER TABLE planes_remediacion DROP CONSTRAINT IF EXISTS chk_prioridad_plan;
ALTER TABLE planes_remediacion ADD CONSTRAINT chk_prioridad_plan CHECK (prioridad IN ('BAJA','MEDIA','ALTA','CRITICA'));

-- ---------- EVIDENCIAS DEL PLAN (Sección 34) ----------
ALTER TABLE evidencias ALTER COLUMN id_hallazgo DROP NOT NULL;
ALTER TABLE evidencias ALTER COLUMN ruta_archivo DROP NOT NULL;
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS id_plan UUID REFERENCES planes_remediacion(id_plan);
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) DEFAULT 'COMENTARIO';
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS comentario TEXT;
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS nombre_archivo VARCHAR(255);

-- ---------- NOTIFICACIONES (Sección 37) ----------
CREATE TABLE IF NOT EXISTS notificaciones (
    id_notificacion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    id_usuario UUID REFERENCES usuarios(id_usuario),   -- NULL = para toda la empresa
    tipo VARCHAR(40) NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    mensaje TEXT,
    recurso VARCHAR(40),
    id_recurso UUID,
    leida BOOLEAN DEFAULT FALSE,
    fecha TIMESTAMP DEFAULT NOW()
);
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislar_notificaciones ON notificaciones;
CREATE POLICY aislar_notificaciones ON notificaciones USING (
  current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));

-- ---------- AUDITORÍA (Sección 42) ----------
ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS recurso VARCHAR(50);
ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS id_recurso VARCHAR(100);
ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS resultado VARCHAR(20) DEFAULT 'EXITO';
ALTER TABLE eventos_auditoria ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- ---------- PERMISOS ----------
GRANT SELECT, INSERT, UPDATE ON historial_vulnerabilidad, notificaciones TO app_user;
-- Append-only real (Sección 40): la app no puede modificar ni borrar auditoría
REVOKE UPDATE, DELETE, TRUNCATE ON eventos_auditoria FROM app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON historial_vulnerabilidad FROM app_user;
GRANT SELECT, INSERT ON eventos_auditoria TO app_user;

COMMIT;
