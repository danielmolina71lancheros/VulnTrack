const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { pool, queryConRLS } = require('../config/db');

const registrar = async (req, res) => {
    const { nombre_empresa, nombre_completo, correo, password } = req.body;

    if (!nombre_empresa || !nombre_completo || !correo || !password) {
        return res.status(400).json({ error: "Todos los campos son obligatorios." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', 'BYPASS', true)");

        const userCheck = await client.query('SELECT id_usuario FROM usuarios WHERE correo = $1', [correo]);
        if (userCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "El correo ya está registrado." });
        }

        const empresaResult = await client.query(
            'INSERT INTO empresas (nombre_empresa) VALUES ($1) RETURNING id_empresa',
            [nombre_empresa]
        );
        const id_empresa = empresaResult.rows[0].id_empresa;

        await client.query(
            `INSERT INTO roles_empresa (id_empresa, nombre, descripcion, permisos) VALUES
                ($1, 'ADMINISTRADOR', 'Acceso total al sistema', '["ALL"]'::jsonb),
                ($1, 'AUDITOR', 'Consulta y registro de vulnerabilidades',
                    '["VER_ACTIVOS", "VER_VULN", "CREAR_VULN", "VER_RIESGOS"]'::jsonb),
                ($1, 'REMEDIADOR', 'Gestión de planes de remediación',
                    '["VER_ACTIVOS", "VER_VULN", "GESTIONAR_REMEDIACION"]'::jsonb)`,
            [id_empresa]
        );

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        await client.query(
            `INSERT INTO usuarios (id_empresa, nombre_completo, correo, password_hash, rol) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id_empresa, nombre_completo, correo, password_hash, 'ADMINISTRADOR']
        );

        await client.query('COMMIT');
        res.status(201).json({ mensaje: "Empresa y usuario registrados exitosamente." });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("[ERROR REGISTRO]:", error.message);
        res.status(500).json({ error: "Fallo interno del servidor." });
    } finally {
        client.release();
    }
};

const login = async (req, res) => {
    const { correo, password, mfa_token } = req.body;
    
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', 'BYPASS', true)");
        
        const result = await client.query(
            'SELECT id_usuario, id_empresa, nombre_completo, correo, password_hash, rol, mfa_secret, mfa_enabled FROM usuarios WHERE correo = $1 AND estado = TRUE',
            [correo]
        );
        await client.query('COMMIT');

        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Credenciales inválidas." });
        }

        const usuario = result.rows[0];

        const passwordValido = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValido) {
            return res.status(401).json({ error: "Credenciales inválidas." });
        }

        // VERIFICACIÓN MFA
        if (usuario.mfa_enabled) {
            if (!mfa_token) {
                // Si tiene MFA pero no mandó el token, le avisamos al frontend que lo necesita
                return res.status(200).json({ mfa_requerido: true, mensaje: "Se requiere código de autenticación (TOTP)." });
            }
            
            // Si mandó el token, lo verificamos
            const isValid = speakeasy.totp.verify({
                secret: usuario.mfa_secret,
                encoding: 'base32',
                token: mfa_token,
                window: 1
            });

            if (!isValid) {
                return res.status(401).json({ error: "Código MFA inválido o expirado." });
            }
        }

        // Buscar si existe un rol personalizado para esta empresa
        const rolesCheck = await client.query(
            'SELECT permisos FROM roles_empresa WHERE id_empresa = $1 AND nombre = $2 AND estado = TRUE',
            [usuario.id_empresa, usuario.rol]
        );
        let permisosAsignados = [];
        if (rolesCheck.rows.length > 0) {
            permisosAsignados = rolesCheck.rows[0].permisos;
        } else if (usuario.rol === 'ADMINISTRADOR') {
            permisosAsignados = ['ALL'];
        }

        const payload = {
            id_usuario: usuario.id_usuario,
            id_empresa: usuario.id_empresa,
            rol: usuario.rol,
            permisos: permisosAsignados,
            nombre_completo: usuario.nombre_completo,
            correo: usuario.correo,
            mfa_enabled: usuario.mfa_enabled
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });

        res.status(200).json({ token });
    } catch (error) {
        console.error("[ERROR LOGIN]:", error.message);
        res.status(500).json({ error: "Fallo interno del servidor." });
    } finally {
        client.release();
    }
};

const configurarMFA = async (req, res) => {
    const { id_usuario, id_empresa } = req.usuario; 
    
    try {
        const client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', 'BYPASS', true)");
        const resultUser = await client.query('SELECT mfa_enabled FROM usuarios WHERE id_usuario = $1', [id_usuario]);
        await client.query('COMMIT');
        client.release();

        if (resultUser.rows[0].mfa_enabled) {
            return res.status(400).json({ error: "El MFA ya está configurado y activo." });
        }

        // Generar un secreto único para el usuario con speakeasy
        const secret = speakeasy.generateSecret({ name: 'VulnTrack (' + id_usuario.substring(0,6) + ')' });
        
        // Guardar el secreto en base32 en la BD (aún sin activarlo)
        await queryConRLS(id_empresa, 
            'UPDATE usuarios SET mfa_secret = $1 WHERE id_usuario = $2 AND estado = TRUE', 
            [secret.base32, id_usuario]
        );
        
        // Convertir la URI en un QR Code en formato Base64 para que el frontend lo pinte
        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        
        res.status(200).json({ 
            mensaje: "Escanea este código con Google Authenticator o Authy",
            qr_code: qrCodeUrl,
            secreto_manual: secret.base32 
        });
    } catch (error) {
        console.error("[ERROR CONFIG MFA]:", error.message);
        res.status(500).json({ error: "Error al configurar MFA." });
    }
};

const habilitarMFA = async (req, res) => {
    const { token_mfa } = req.body;
    const { id_usuario, id_empresa } = req.usuario;
    
    try {
        const client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant', 'BYPASS', true)");
        
        const result = await client.query('SELECT mfa_secret FROM usuarios WHERE id_usuario = $1', [id_usuario]);
        await client.query('COMMIT');
        client.release();
        
        const { mfa_secret } = result.rows[0];
        
        if (!mfa_secret) return res.status(400).json({ error: "No has configurado el MFA." });
        
        // Verificar que el token ingresado coincida con el secreto
        const isValid = speakeasy.totp.verify({
            secret: mfa_secret,
            encoding: 'base32',
            token: token_mfa,
            window: 1
        });
        
        if (isValid) {
            // Activar MFA oficialmente
            await queryConRLS(id_empresa, 
                'UPDATE usuarios SET mfa_enabled = TRUE WHERE id_usuario = $1', 
                [id_usuario]
            );
            return res.status(200).json({ mensaje: "MFA habilitado correctamente. En tu próximo login necesitarás el código." });
        } else {
            return res.status(400).json({ error: "Código incorrecto." });
        }
    } catch (error) {
        res.status(500).json({ error: "Error al habilitar MFA." });
    }
};

module.exports = { registrar, login, configurarMFA, habilitarMFA };
