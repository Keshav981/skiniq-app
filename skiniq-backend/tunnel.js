const localtunnel = require('localtunnel');

(async () => {
  try {
    const tunnel = await localtunnel({ 
      port: 3000, 
      subdomain: 'skiniq-api-2026-prod' 
    });

    console.log('Localtunnel active at:', tunnel.url);

    tunnel.on('close', () => {
      console.log('Tunnel closed.');
      process.exit(1);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });

    // Keep the process alive
    setInterval(() => {
      if (tunnel.closed) {
        console.log('Detected closed tunnel, exiting...');
        process.exit(1);
      }
    }, 5000);

  } catch (err) {
    console.error('Failed to start localtunnel:', err);
    process.exit(1);
  }
})();
