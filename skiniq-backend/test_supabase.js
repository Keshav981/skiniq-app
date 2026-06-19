const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key:', supabaseKey ? 'exists' : 'missing');

const supabase = createClient(supabaseUrl, supabaseKey);

// Generate standard UUIDv4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function test() {
  const testId = generateUUID();
  console.log('Generated test UUID:', testId);

  const payload = {
    id: testId,
    name: 'Test UUID User',
    age_range: '25-34',
    skin_type: 'combination',
    skin_goals: ['hydration'],
    updated_at: new Date().toISOString()
  };

  console.log('Trying to insert profile...');
  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error('Insert profiles error:', error);
  } else {
    console.log('Success! Profile inserted:', data);
    
    // Clean up
    console.log('Cleaning up...');
    const { error: delError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', testId);
    if (delError) {
      console.error('Delete profiles error:', delError);
    } else {
      console.log('Successfully deleted test profile.');
    }
  }
}

test();
