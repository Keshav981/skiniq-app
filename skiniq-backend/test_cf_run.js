const { spawn } = require('child_process');
const cf = require('cloudflared');

const run = async () => {
  console.log('Starting Cloudflare Quick Tunnel via binary...');
  try {
    const child = spawn(cf.bin, ['tunnel', '--url', 'http://localhost:3000']);
    
    child.stdout.on('data', data => {
      console.log('STDOUT:', data.toString());
    });
    
    child.stderr.on('data', data => {
      const log = data.toString();
      console.log('STDERR:', log);
      // Cloudflare Quick Tunnel URLs look like https://*.trycloudflare.com
      const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        console.log('FOUND CLOUDFLARE PUBLIC URL:', match[0]);
      }
    });

    child.on('close', code => {
      console.log(`Process exited with code ${code}`);
    });

    setTimeout(() => {
      console.log('Killing tunnel...');
      child.kill();
      process.exit(0);
    }, 10000);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

run();
