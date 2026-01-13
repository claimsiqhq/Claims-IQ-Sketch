import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addAccountIdColumn() {
  console.log('Adding account_id column to user_ms365_tokens table...');
  
  const { error } = await supabase.rpc('exec_sql', {
    query: 'ALTER TABLE user_ms365_tokens ADD COLUMN IF NOT EXISTS account_id TEXT;'
  });
  
  if (error) {
    // Try direct approach via REST
    console.log('RPC failed, trying alternative approach...');
    
    // Use raw fetch to execute SQL
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        query: 'ALTER TABLE user_ms365_tokens ADD COLUMN IF NOT EXISTS account_id TEXT;'
      })
    });
    
    if (!response.ok) {
      console.log('Alternative also failed. You may need to add the column manually in Supabase SQL Editor:');
      console.log('ALTER TABLE user_ms365_tokens ADD COLUMN IF NOT EXISTS account_id TEXT;');
    } else {
      console.log('Column added successfully!');
    }
  } else {
    console.log('Column added successfully!');
  }
}

addAccountIdColumn().catch(console.error);
