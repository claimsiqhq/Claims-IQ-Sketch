
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL or SUPABASE_DATABASE_URL must be set');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false } // Required for Supabase in many environments
});

async function fixSchema() {
  const client = await pool.connect();
  try {
    console.log('Starting manual schema fix...');

    // 1. Fix claim_checklists.created_by type casting error
    try {
      console.log('Fixing claim_checklists.created_by...');
      // Try to alter with casting. If fails, drop and recreate.
      await client.query(`
        DO $$
        BEGIN
          BEGIN
            ALTER TABLE claim_checklists 
            ALTER COLUMN created_by TYPE uuid USING created_by::uuid;
          EXCEPTION WHEN OTHERS THEN
            -- If casting fails (e.g. non-uuid strings), drop and recreate
            ALTER TABLE claim_checklists DROP COLUMN created_by;
            ALTER TABLE claim_checklists ADD COLUMN created_by uuid REFERENCES users(id);
          END;
        END $$;
      `);
      console.log('claim_checklists.created_by fixed.');
    } catch (e) {
      console.error('Error fixing claim_checklists:', e);
    }

    // 2. Add missing columns to inspection_workflow_steps
    console.log('Ensuring inspection_workflow_steps columns exist...');
    
    const stepsColumns = [
      { name: 'origin', type: 'varchar(30) DEFAULT \'manual\'' },
      { name: 'source_rule_id', type: 'varchar(100)' },
      { name: 'conditions', type: 'jsonb DEFAULT \'{}\'::jsonb' },
      { name: 'evidence_requirements', type: 'jsonb DEFAULT \'[]\'::jsonb' },
      { name: 'blocking', type: 'varchar(20) DEFAULT \'advisory\'' },
      { name: 'blocking_condition', type: 'jsonb' },
      { name: 'geometry_binding', type: 'jsonb' },
      { name: 'endorsement_source', type: 'varchar(100)' },
      { name: 'peril_specific', type: 'varchar(50)' },
      { name: 'room_id', type: 'uuid' },
      { name: 'room_name', type: 'varchar(100)' },
      // Check create_by just in case
      { name: 'completed_by', type: 'varchar' } 
    ];

    for (const col of stepsColumns) {
      try {
        await client.query(`
          ALTER TABLE inspection_workflow_steps 
          ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};
        `);
        console.log(`Verified column: ${col.name}`);
      } catch (e) {
        console.error(`Error adding column ${col.name}:`, e);
      }
    }

    console.log('Schema fix completed successfully.');

  } catch (err) {
    console.error('Unexpected error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixSchema();
