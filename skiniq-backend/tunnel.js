const { spawn } = require('child_process');
const https = require('https');
const cf = require('cloudflared');
require('dotenv').config();

const token = process.env.GITHUB_TOKEN || '';
const owner = 'Keshav981';
const repo = 'skiniq-app';
const filePath = 'backend_url.txt';

// Helper to push URL to GitHub
const publishUrlToGithub = async (url) => {
  console.log(`Publishing tunnel URL ${url} to GitHub...`);
  
  const getOptions = {
    hostname: 'api.github.com',
    port: 443,
    path: `/repos/${owner}/${repo}/contents/${filePath}`,
    method: 'GET',
    headers: {
      'User-Agent': 'NodeJS-Agent',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  };
  
  let sha = null;
  
  try {
    const checkRes = await new Promise((resolve, reject) => {
      const req = https.request(getOptions, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, data: data ? JSON.parse(data) : null }));
      });
      req.on('error', reject);
      req.end();
    });
    
    if (checkRes.statusCode === 200 && checkRes.data) {
      sha = checkRes.data.sha;
    }
  } catch (err) {
    console.warn('Error checking existing backend_url.txt:', err.message);
  }
  
  const putBody = {
    message: 'sys: update active backend url',
    content: Buffer.from(url).toString('base64'),
    branch: 'main'
  };
  if (sha) putBody.sha = sha;
  
  const putOptions = {
    hostname: 'api.github.com',
    port: 443,
    path: `/repos/${owner}/${repo}/contents/${filePath}`,
    method: 'PUT',
    headers: {
      'User-Agent': 'NodeJS-Agent',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    }
  };
  
  try {
    const putRes = await new Promise((resolve, reject) => {
      const req = https.request(putOptions, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, data: data ? JSON.parse(data) : null }));
      });
      req.on('error', reject);
      req.write(JSON.stringify(putBody));
      req.end();
    });
    
    if (putRes.statusCode === 200 || putRes.statusCode === 201) {
      console.log('Successfully published backend URL to GitHub!');
    } else {
      console.error('Failed to publish URL to GitHub:', putRes.statusCode, putRes.data);
    }
  } catch (err) {
    console.error('Error writing backend URL to GitHub:', err);
  }
};

// Start the tunnel process
(async () => {
  console.log('Starting Cloudflare Quick Tunnel...');
  try {
    const child = spawn(cf.bin, ['tunnel', '--url', 'http://localhost:3000']);
    let published = false;

    child.stdout.on('data', data => {
      console.log('STDOUT:', data.toString());
    });
    
    child.stderr.on('data', data => {
      const log = data.toString();
      console.log('STDERR:', log);
      
      const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !published) {
        published = true;
        const publicUrl = match[0];
        console.log('FOUND CLOUDFLARE PUBLIC URL:', publicUrl);
        publishUrlToGithub(publicUrl);
      }
    });

    child.on('close', code => {
      console.log(`Tunnel process exited with code ${code}`);
      process.exit(1);
    });

    // Check tunnel health periodically
    setInterval(() => {
      if (child.killed) {
        console.log('Detected killed tunnel process, exiting...');
        process.exit(1);
      }
    }, 5000);

  } catch (err) {
    console.error('Failed to start Cloudflare tunnel:', err);
    process.exit(1);
  }
})();
