const { pool } = require('./src/config/db');

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      "SELECT set_config('app.current_tenant', 'BYPASS', true)"
    );

    console.log('Prueba 1: consulta de usuarios');

    const usuarios = await client.query(
      `SELECT id_usuario, id_empresa, nombre_completo, correo,
              password_hash, rol, mfa_secret, mfa_enabled
       FROM usuarios
       WHERE correo = $1 AND estado = TRUE`,
      ['diagnostico-no-existe@example.invalid']
    );

    console.log('Consulta de usuarios OK. Filas:', usuarios.rowCount);

    console.log('Prueba 2: consulta de roles');

    const roles = await client.query(
      `SELECT permisos
       FROM roles_empresa
       WHERE id_empresa = $1 AND nombre = $2 AND estado = TRUE`,
      ['00000000-0000-0000-0000-000000000000', 'ADMINISTRADOR']
    );

    console.log('Consulta de roles OK. Filas:', roles.rowCount);

  } catch (error) {
    console.error('C?digo:', error.code);
    console.error('Error:', error.message);
    console.error('Detalle:', error.detail || 'Sin detalle adicional');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
}

main();
