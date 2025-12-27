import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

async function addColumn() {
  try {
    console.log('Adding missing required column...');
    await pool.query(`
      ALTER TABLE inspection_workflow_steps 
      ADD COLUMN IF NOT EXISTS required boolean DEFAULT true
    `);
    console.log('Column added successfully!');
    
    // Also check what columns exist now
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'inspection_workflow_steps' 
      ORDER BY ordinal_position
    `);
    console.log('Current columns:', result.rows.map(r => r.column_name).join(', '));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

addColumn();
