import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT!),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Test connection
export async function dbConnection() {
  try {
    const client = await pool.connect();
    console.log('Db connected');
    client.release();
    return true;
  } catch (error) {
    console.error('db connection failed:', error);
    return false;
  }
}
