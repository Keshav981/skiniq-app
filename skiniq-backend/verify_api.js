const fetch = require('node-fetch');

const backendUrl = 'http://localhost:3000';

function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Dummy base64 face-like image data
const dummyImageBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function verify() {
  const userId = generateUUIDv4();
  console.log(`[Test] Using generated UUIDv4: ${userId}`);

  // 1. Create Profile
  const profilePayload = {
    id: userId,
    name: 'Integration Test User',
    ageRange: '25-34',
    skinType: 'dry',
    skinGoals: ['hydration', 'anti-aging']
  };

  console.log('[Test] Sending POST /api/profile...');
  const profileRes = await fetch(`${backendUrl}/api/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true'
    },
    body: JSON.stringify(profilePayload)
  });

  if (!profileRes.ok) {
    const errText = await profileRes.text();
    console.error(`[Test] Profile creation failed with status ${profileRes.status}:`, errText);
    process.exit(1);
  }

  const profileData = await profileRes.json();
  console.log('[Test] Profile creation success:', profileData);

  // 2. Perform Scan
  console.log('[Test] Sending POST /api/scans...');
  const scanPayload = {
    userId: userId,
    imageBase64: dummyImageBase64,
    savePhoto: false,
    isFrontFacing: false
  };

  const scanRes = await fetch(`${backendUrl}/api/scans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true'
    },
    body: JSON.stringify(scanPayload)
  });

  if (!scanRes.ok) {
    const errText = await scanRes.text();
    console.error(`[Test] Scan creation failed with status ${scanRes.status}:`, errText);
    process.exit(1);
  }

  const scanData = await scanRes.json();
  console.log('[Test] Scan creation success. Returned scores:', scanData.scores);
  console.log('[Test] Detections:', scanData.detections);
  console.log('[Test] Recommendations:', scanData.recommended_products ? scanData.recommended_products.length : 0, 'products');

  // 3. Clean up history
  console.log('[Test] Cleaning up history via DELETE /api/history...');
  const deleteRes = await fetch(`${backendUrl}/api/history/${userId}`, {
    method: 'DELETE',
    headers: { 'bypass-tunnel-reminder': 'true' }
  });

  if (deleteRes.ok) {
    console.log('[Test] Clean up success:', await deleteRes.json());
  } else {
    console.error(`[Test] Clean up failed with status ${deleteRes.status}`);
  }

  console.log('[Test] Integration test completed successfully!');
}

verify().catch(err => {
  console.error('[Test] Unexpected error:', err);
  process.exit(1);
});
