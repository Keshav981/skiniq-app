const fetch = require('node-fetch');

const backendUrl = 'http://localhost:3000';

function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 1x1 blank white pixel base64 (definitely not a face)
const blankImageBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Download a small face portrait and convert to base64
async function getRealFaceBase64() {
  console.log('[Test] Downloading test face portrait from Unsplash...');
  const res = await fetch('https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80');
  if (!res.ok) throw new Error('Failed to download test face image');
  const buffer = await res.buffer();
  return buffer.toString('base64');
}

async function verify() {
  const userId = generateUUIDv4();
  console.log(`[Test] Using generated UUIDv4: ${userId}`);

  // 1. Create Profile
  const profilePayload = {
    id: userId,
    name: 'Face Verification Test User',
    ageRange: '25-34',
    skinType: 'combination',
    skinGoals: ['hydration', 'pores']
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

  // 2. Perform Non-Face Scan (Should fail)
  console.log('[Test] Sending POST /api/scans with blank image (expecting rejection)...');
  const rejectRes = await fetch(`${backendUrl}/api/scans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true'
    },
    body: JSON.stringify({
      userId: userId,
      imageBase64: blankImageBase64,
      savePhoto: false,
      isFrontFacing: false
    })
  });

  if (rejectRes.status === 400) {
    const rejectData = await rejectRes.json();
    console.log('[Test] Success! API correctly rejected non-face image:', rejectData);
  } else {
    console.error(`[Test] Fail! API did not reject the blank image as expected. Status: ${rejectRes.status}`);
    process.exit(1);
  }

  // 3. Perform Valid Face Scan (Should succeed)
  let faceImageBase64;
  try {
    faceImageBase64 = await getRealFaceBase64();
  } catch (err) {
    console.warn('[Test] Warning: Unsplash down, skipping successful scan check:', err.message);
  }

  if (faceImageBase64) {
    console.log('[Test] Sending POST /api/scans with valid face portrait...');
    const scanRes = await fetch(`${backendUrl}/api/scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'bypass-tunnel-reminder': 'true'
      },
      body: JSON.stringify({
        userId: userId,
        imageBase64: faceImageBase64,
        savePhoto: false,
        isFrontFacing: false
      })
    });

    if (!scanRes.ok) {
      const errText = await scanRes.text();
      console.error(`[Test] Scan creation failed with status ${scanRes.status}:`, errText);
      process.exit(1);
    }

    const scanData = await scanRes.json();
    console.log('[Test] Scan creation success! Returned scores:', scanData.scores);
    console.log('[Test] Detections count:', scanData.detections ? scanData.detections.length : 0);
  }

  // 4. Clean up history
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
