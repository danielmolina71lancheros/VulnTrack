const { pool } = require('./src/config/db');

async function main() {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS base,
        current_user AS usuario,
        current_schema() AS esquema,
        (
          SELECT COUNT(*)
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'usuarios'
            AND column_name = 'rol'
        ) AS existe_rol
    `);

    console.log(result.rows[0]);
  } catch (error) {
    console.error('Error de diagn?stico:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
