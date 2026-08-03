const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ============ INICIALIZACIÓN ============
async function inicializarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id SERIAL PRIMARY KEY,
      telefono TEXT NOT NULL,
      rol TEXT NOT NULL,
      contenido TEXT NOT NULL,
      creado_en TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS citas (
      id SERIAL PRIMARY KEY,
      telefono TEXT NOT NULL,
      nombre TEXT NOT NULL,
      motivo TEXT NOT NULL,
      fecha_hora TIMESTAMPTZ NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa',
      recordatorio_enviado BOOLEAN NOT NULL DEFAULT FALSE,
      creado_en TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('Base de datos lista (tabla mensajes y citas verificadas)');
}

// ============ MENSAJES ============
async function guardarMensaje(telefono, rol, contenido) {
  await pool.query(
    'INSERT INTO mensajes (telefono, rol, contenido) VALUES ($1, $2, $3)',
    [telefono, rol, contenido]
  );
}

async function obtenerTodosLosMensajes() {
  const { rows } = await pool.query(
    'SELECT * FROM mensajes ORDER BY creado_en ASC'
  );
  return rows;
}

// ============ CITAS ============
async function guardarCita(telefono, nombre, motivo, fechaHora) {
  const { rows } = await pool.query(
    `INSERT INTO citas (telefono, nombre, motivo, fecha_hora, estado)
     VALUES ($1, $2, $3, $4, 'activa') RETURNING *`,
    [telefono, nombre, motivo, fechaHora]
  );
  return rows[0];
}

async function obtenerCitaPorTelefono(telefono) {
  const { rows } = await pool.query(
    `SELECT * FROM citas WHERE telefono = $1 AND estado = 'activa'
     ORDER BY creado_en DESC LIMIT 1`,
    [telefono]
  );
  return rows[0] || null;
}

async function cancelarCitaDB(citaId) {
  await pool.query(`UPDATE citas SET estado = 'cancelada' WHERE id = $1`, [citaId]);
}

async function reagendarCitaDB(citaId, nuevaFechaHora) {
  await pool.query(
    `UPDATE citas SET fecha_hora = $1, recordatorio_enviado = FALSE WHERE id = $2`,
    [nuevaFechaHora, citaId]
  );
}

// ============ RECORDATORIOS ============
// Citas activas cuya fecha_hora cae dentro del día de mañana (hora de México) y aún no se les mandó recordatorio
async function obtenerCitasParaManana() {
  const { rows } = await pool.query(
    `SELECT * FROM citas
     WHERE estado = 'activa'
       AND recordatorio_enviado = FALSE
       AND (fecha_hora AT TIME ZONE 'America/Mexico_City')::date =
           ((NOW() AT TIME ZONE 'America/Mexico_City')::date + INTERVAL '1 day')`
  );
  return rows;
}

async function marcarRecordatorioEnviado(citaId) {
  await pool.query(`UPDATE citas SET recordatorio_enviado = TRUE WHERE id = $1`, [citaId]);
}

module.exports = {
  inicializarDB,
  guardarMensaje,
  obtenerTodosLosMensajes,
  guardarCita,
  obtenerCitaPorTelefono,
  cancelarCitaDB,
  reagendarCitaDB,
  obtenerCitasParaManana,
  marcarRecordatorioEnviado,
};
