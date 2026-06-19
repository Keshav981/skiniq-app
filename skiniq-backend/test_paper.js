const fetch = require('node-fetch');

const backendUrl = 'http://localhost:3000';

async function getPaperBase64() {
  console.log('[Test] Downloading paper image from Unsplash...');
  const res = await fetch('https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=200&q=80');
  if (!res.ok) throw new Error('Failed to download paper image');
  const buffer = await res.buffer();
  return buffer.toString('base64');
}

async function test() {
  const paperBase64 = await getPaperBase64();
  
  console.log('[Test] Sending POST /api/scans with paper image...');
  const scanRes = await fetch(`${backendUrl}/api/scans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true'
    },
    body: JSON.stringify({
      userId: '488cfd7f-c803-414a-be82-057b47181e20', // test user
      imageBase64: paperBase64,
      savePhoto: false,
      isFrontFacing: false
    })
  });

  const status = scanRes.status;
  const data = await scanRes.json();
  console.log(`[Test] Response Status: ${status}`);
  console.log('[Test] Response Data:', data);
}

test().catch(console.error);
