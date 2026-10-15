-- Migration Script for VulnTrack Spec
BEGIN;

-- 1. ACTIVO UPDATES
ALTER TABLE activos
ADD COLUMN codigo_activo VARCHAR(50),
ADD COLUMN marca VARCHAR(100),
ADD COLUMN modelo VARCHAR(100),
ADD COLUMN numero_serie VARCHAR(100),
ADD COLUMN hostname VARCHAR(150),
ADD COLUMN direccion_ip VARCHAR(50),
ADD COLUMN endpoint VARCHAR(255),
ADD COLUMN sistema_operativo VARCHAR(100),
ADD COLUMN version_so VARCHAR(50),
ADD COLUMN area VARCHAR(100),
ADD COLUMN sede VARCHAR(100),
ADD COLUMN descripcion TEXT,
ADD COLUMN fecha_adquisicion DATE,
ADD COLUMN estado_activo VARCHAR(50) DEFAULT 'Activo';

-- Generate unique codigo_activo for existing rows based on id
UPDATE activos SET codigo_activo = 'ACT-' || substr(id_activo::text, 1, 6) WHERE codigo_activo IS NULL;
ALTER TABLE activos ADD CONSTRAINT uq_codigo_activo UNIQUE (id_empresa, codigo_activo);

-- 2. HALLAZGOS_VULN UPDATES (1:N from Activos)
ALTER TABLE hallazgos_vuln
ADD COLUMN id_activo UUID,
ADD COLUMN fuente VARCHAR(100) DEFAULT 'Manual';

-- Migrate existing relationships from the old junction table
UPDATE hallazgos_vuln h
SET id_activo = (SELECT id_activo FROM hallazgos_activos ha WHERE ha.id_hallazgo = h.id_hallazgo LIMIT 1);

-- Drop old junction table
DROP TABLE hallazgos_activos;

ALTER TABLE hallazgos_vuln ADD CONSTRAINT hallazgos_vuln_id_activo_fkey FOREIGN KEY (id_activo) REFERENCES activos(id_activo);
-- Enforce "Asset + CVE must be unique" (Rule 4)
ALTER TABLE hallazgos_vuln ADD CONSTRAINT uq_activo_cve UNIQUE (id_activo, cve_id);

-- 3. PLANES_REMEDIACION UPDATES (M:N to Hallazgos)
CREATE TABLE plan_vulnerabilidades (
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    id_plan UUID NOT NULL REFERENCES planes_remediacion(id_plan),
    id_hallazgo UUID NOT NULL REFERENCES hallazgos_vuln(id_hallazgo),
    estado BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (id_plan, id_hallazgo)
);

ALTER TABLE plan_vulnerabilidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aislar_plan_vuln" ON plan_vulnerabilidades USING (
    current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true)
);

-- Migrate existing 1:1 plans to junction table
INSERT INTO plan_vulnerabilidades (id_empresa, id_plan, id_hallazgo)
SELECT id_empresa, id_plan, id_hallazgo FROM planes_remediacion WHERE id_hallazgo IS NOT NULL;

-- Remove old column
ALTER TABLE planes_remediacion DROP COLUMN id_hallazgo;

-- Add prioridades y responsable to match spec
ALTER TABLE planes_remediacion ADD COLUMN nombre VARCHAR(150), ADD COLUMN descripcion TEXT, ADD COLUMN prioridad VARCHAR(20) DEFAULT 'MEDIA';

UPDATE planes_remediacion SET nombre = 'Plan ' || substr(id_plan::text, 1, 6) WHERE nombre IS NULL;

-- 4. GRANTS
GRANT SELECT, INSERT, UPDATE ON TABLE plan_vulnerabilidades TO app_user;

COMMIT;
