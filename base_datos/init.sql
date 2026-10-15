-- Habilitar extensión para UUIDs criptográficos
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- [1] Tabla de inquilinos (Empresas)
CREATE TABLE empresas (
    id_empresa UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_empresa VARCHAR(150) NOT NULL,
    estado BOOLEAN DEFAULT TRUE -- SOFT DELETE
);

CREATE TABLE roles_empresa (
    id_rol UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255),
    permisos JSONB NOT NULL DEFAULT '[]'::jsonb,
    estado BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW()
);

-- [2] Tabla de usuarios (Roles estrictos)
CREATE TABLE usuarios (
    id_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    nombre_completo VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mfa_secret VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    estado BOOLEAN DEFAULT TRUE, -- SOFT DELETE
    fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- [3] Activos
CREATE TABLE activos (
    id_activo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    nombre VARCHAR(150) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- Servidor, Equipo, Aplicacion, API, BD
    criticidad VARCHAR(20) CHECK (criticidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
    propietario VARCHAR(100),
    estado BOOLEAN DEFAULT TRUE, -- SOFT DELETE
    fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- [4] Hallazgos (Vulnerabilidades)
CREATE TABLE hallazgos_vuln (
    id_hallazgo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    cve_id VARCHAR(20),
    severidad VARCHAR(20) CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
    cvss DECIMAL(3,1),
    estado_hallazgo VARCHAR(50) CHECK (estado_hallazgo IN ('ABIERTO', 'EN_PROCESO', 'MITIGADO', 'FALSO_POSITIVO', 'CERRADO')),
    id_auditor UUID REFERENCES usuarios(id_usuario),
    estado BOOLEAN DEFAULT TRUE, -- SOFT DELETE
    fecha_descubrimiento TIMESTAMP DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP DEFAULT NOW()
);

-- [5] Hallazgos <-> Activos (Muchos a Muchos)
CREATE TABLE hallazgos_activos (
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa), -- Requerido para RLS
    id_hallazgo UUID REFERENCES hallazgos_vuln(id_hallazgo),
    id_activo UUID REFERENCES activos(id_activo),
    estado BOOLEAN DEFAULT TRUE, -- SOFT DELETE
    PRIMARY KEY (id_hallazgo, id_activo)
);

-- [6] Riesgos (Matriz de riesgos)
CREATE TABLE riesgos (
    id_riesgo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    id_hallazgo UUID NOT NULL REFERENCES hallazgos_vuln(id_hallazgo),
    probabilidad VARCHAR(20) CHECK (probabilidad IN ('BAJA', 'MEDIA', 'ALTA', 'MUY_ALTA')),
    impacto VARCHAR(20) CHECK (impacto IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')),
    riesgo_global VARCHAR(20),
    estado BOOLEAN DEFAULT TRUE -- SOFT DELETE
);

-- [7] Planes de Remediación
CREATE TABLE planes_remediacion (
    id_plan UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    id_hallazgo UUID NOT NULL REFERENCES hallazgos_vuln(id_hallazgo),
    id_remediador UUID REFERENCES usuarios(id_usuario),
    plan_accion TEXT NOT NULL,
    fecha_limite TIMESTAMP,
    estado_plan VARCHAR(20) CHECK (estado_plan IN ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'VENCIDO')),
    estado BOOLEAN DEFAULT TRUE, -- SOFT DELETE
    fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- [8] Evidencias y Archivos
CREATE TABLE evidencias (
    id_evidencia UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    id_hallazgo UUID NOT NULL REFERENCES hallazgos_vuln(id_hallazgo),
    ruta_archivo VARCHAR(255) NOT NULL,
    subido_por UUID REFERENCES usuarios(id_usuario),
    estado BOOLEAN DEFAULT TRUE, -- SOFT DELETE
    fecha_creacion TIMESTAMP DEFAULT NOW()
);

-- [9] Eventos de Auditoría (Logs inmutables)
CREATE TABLE eventos_auditoria (
    id_evento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresas(id_empresa),
    id_usuario UUID REFERENCES usuarios(id_usuario),
    accion VARCHAR(50) NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    detalles JSONB,
    ip_origen VARCHAR(45),
    fecha_evento TIMESTAMP DEFAULT NOW()
);


-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE activos ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallazgos_vuln ENABLE ROW LEVEL SECURITY;
ALTER TABLE hallazgos_activos ENABLE ROW LEVEL SECURITY;
ALTER TABLE riesgos ENABLE ROW LEVEL SECURITY;
ALTER TABLE planes_remediacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_auditoria ENABLE ROW LEVEL SECURITY;

-- Crear un usuario de base de datos restringido para que el RLS aplique
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Políticas universales de aislamiento por inquilino con BYPASS para Auth
CREATE POLICY aislar_empresas ON empresas USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_roles_empresa ON roles_empresa USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_usuarios ON usuarios USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_activos ON activos USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_hallazgos ON hallazgos_vuln USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_hallazgos_activos ON hallazgos_activos USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_riesgos ON riesgos USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_planes ON planes_remediacion USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_evidencias ON evidencias USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
CREATE POLICY aislar_eventos ON eventos_auditoria USING (current_setting('app.current_tenant', true) = 'BYPASS' OR id_empresa::text = current_setting('app.current_tenant', true));
