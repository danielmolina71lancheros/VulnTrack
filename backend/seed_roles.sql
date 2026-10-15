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
SELECT id_empresa, 'REMEDIADOR', 'Gestion de planes de remediacion',
       '["VER_ACTIVOS", "VER_VULN", "GESTIONAR_REMEDIACION"]'::jsonb
FROM empresas
ON CONFLICT (id_empresa, nombre) DO NOTHING;
