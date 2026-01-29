#!/usr/bin/env node
// Gateway test: DNS -> TLS -> WebSocket upgrade check to gateway.discord.gg
// This is safe to run in CI/deploy logs; set GATEWAY_TEST=1 to run automatically during startup.

const dns = require('dns').promises;
const tls = require('tls');

const HOST = 'gateway.discord.gg';
const PORT = 443;
const TIMEOUT = 8000;

async function run() {
  try {
    const addrs = await dns.resolve4(HOST).catch(async () => { return await dns.resolve(HOST).catch(()=>[]); });
    console.log('DNS resolved addresses:', addrs && addrs.length ? addrs.join(', ') : 'none');
  } catch(e) { console.warn('DNS lookup failed:', e && e.message?e.message:e); }

  await new Promise((resolve, reject) => {
    const opts = { host: HOST, port: PORT, servername: HOST, timeout: TIMEOUT };
    const s = tls.connect(opts, () => {
      console.log(`TLS connected to ${HOST}:${PORT} (authorized=${s.authorized})`);
      // Send websocket upgrade request
      const key = Buffer.from(Array.from({length:16},() => Math.floor(Math.random()*256))).toString('base64');
      const req = [
        `GET /?v=10&encoding=json HTTP/1.1`,
        `Host: ${HOST}`,
        `User-Agent: gateway-test`,
        `Upgrade: websocket`,
        `Connection: Upgrade`,
        `Sec-WebSocket-Key: ${key}`,
        `Sec-WebSocket-Version: 13`,
        `\r\n`
      ].join('\r\n');
      s.write(req);
    });

    let got = '';
    let done = false;
    const onerr = (e) => {
      if (done) return;
      done = true;
      console.error('TLS/WebSocket test failed:', e && e.message?e.message:e);
      s.destroy();
      reject(e);
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      console.error('TLS/WebSocket test timed out after', TIMEOUT, 'ms');
      s.destroy();
      reject(new Error('timeout'));
    }, TIMEOUT);

    s.on('data', (chunk) => {
      got += chunk.toString();
      if (got.indexOf('\r\n\r\n') !== -1) {
        clearTimeout(timer);
        if (done) return;
        done = true;
        const head = got.split('\r\n\r\n')[0];
        const statusLine = head.split('\r\n')[0] || '';
        console.log('Server response status:', statusLine);
        // success check
        if (/^HTTP\/\d+\.\d+\s+101\s+/i.test(statusLine)) {
          console.log('WebSocket upgrade succeeded (101 Switching Protocols)');
          s.end();
          resolve();
        } else {
          console.error('WebSocket upgrade failed or returned non-101 response. Headers:\n', head);
          s.end();
          reject(new Error('non-101 response'));
        }
      }
    });
    s.on('error', onerr);
    s.on('end', () => {
      if (!done) {
        clearTimeout(timer);
        done = true;
        console.error('Socket ended before response');
        reject(new Error('ended'));
      }
    });
    s.on('close', () => {});
  });
}

run().then(()=> { console.log('Gateway test completed successfully'); process.exit(0); }).catch(e=> { console.error('Gateway test failed:', e && e.message ? e.message : e); process.exit(2); });