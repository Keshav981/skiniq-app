const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Checking scans table schema in Supabase...');
  const { data, error } = await supabase
    .from('scans')
    .select('id, detections, recommended_products, is_front_facing')
    .limit(1);

  if (error) {
    console.error('Schema check failed! Error details:', error);
    if (error.message.includes('column') || error.message.includes('not found')) {
      console.log('\n-> DIAGNOSIS: The scans table is missing the required columns. You must run the SQL alter script in the Supabase Dashboard SQL Editor.');
    }
  } else {
    console.log('Schema check succeeded! The columns exist in the scans table.', data);
  }
}

check();
