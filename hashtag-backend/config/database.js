
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL connection error:", error.message);
});

async function testDatabaseConnection() {
  const result = await pool.query(
    "SELECT NOW() AS database_time, current_database() AS database_name"
  );

  return result.rows[0];
}

module.exports = {
  pool,
  testDatabaseConnection,
};
