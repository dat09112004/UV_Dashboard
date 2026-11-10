import http from 'node:http';
import { ENV } from './config/env.js';
import { createApp } from './app.js';
import { businessToday } from './utils/business.js';

const app = createApp();

export function startServer(port = ENV.PORT, host = ENV.HOST) {
  const server = http.createServer((req, res) => {
    app.handle(req, res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      if (ENV.NODE_ENV !== 'test') {
        console.log('=============================================================================');
        console.log(' UYEN VU INTERNATIONAL — EXECUTIVE BACKEND API SERVER');
        console.log(` Listening on: http://${host}:${boundPort}/api/v1`);
        console.log(` Active Node Runtime: ${process.version} (Target: v26.12.1)`);
        console.log(` Business Timezone: ${ENV.TZ} (Today: ${businessToday()})`);
        console.log('=============================================================================');
      }
      resolve({ server, port: boundPort });
    });
  });
}

// Start automatically when executed directly (node src/server.js)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(err => {
    console.error('[Server Fatal Error]:', err);
    process.exit(1);
  });
}
