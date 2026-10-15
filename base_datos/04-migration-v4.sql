BEGIN;

CREATE TABLE IF NOT EXISTS roles_empresa (
    id_rol UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255),
    permisos JSONB NOT NULL DEFAULT '[]'::jsonb,
    estado BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_empresa_nombre_idx
    ON roles_empresa (id_empresa, nombre);

ALTER TABLE roles_empresa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislar_roles_empresa ON roles_empresa;
CREATE POLICY aislar_roles_empresa ON roles_empresa
    USING (current_setting('app.current_tenant', true) = 'BYPASS'
        OR id_empresa::text = current_setting('app.current_tenant', true))
    WITH CHECK (current_setting('app.current_tenant', true) = 'BYPASS'
        OR id_empresa::text = current_setting('app.current_tenant', true));

GRANT SELECT, INSERT, UPDATE ON roles_empresa TO app_user;

INSERT INTO roles_empresa (id_empresa, nombre, descripcion, permisos)
SELECT id_empresa, 'ADMINISTRADOR', 'Acceso total al sistema', '["ALL"]'::jsonb
FROM empresas
ON CONFLICT (id_empresa, nombre) DO NOTHING;

INSERT INTO roles_empresa (id_empresa, nombre, descripcion, permisos)
SELECT id_empresa, 'AUDITOR', 'Consulta y registro de vulnerabilidades',
       '["VER_ACTIVOS", "VER_VULN", "CREAR_VULN", "VER_RIESGOS"]'::jsonb
FROM empresas
ON CONFLICT (id_empresa, nombre) DO NOTHING;

INSERT INTO roles_empresa (id_empresa, nombre, descripcion, permisos)
SELECT id_empresa, 'REMEDIADOR', 'Gestión de planes de remediación',
       '["VER_ACTIVOS", "VER_VULN", "GESTIONAR_REMEDIACION"]'::jsonb
FROM empresas
ON CONFLICT (id_empresa, nombre) DO NOTHING;

COMMIT;
