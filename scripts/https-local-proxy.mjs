import http from 'node:http';
import https from 'node:https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { loadWorkspaceEnv } from './env-utils.mjs';

loadWorkspaceEnv();

function parseArgs(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      map.set(key, 'true');
      continue;
    }
    map.set(key, next);
    index += 1;
  }
  return map;
}

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function ensureCertificate(certDir, hosts) {
  mkdirSync(certDir, { recursive: true });

  const keyPath = path.join(certDir, 'localhost-key.pem');
  const certPath = path.join(certDir, 'localhost-cert.pem');
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    const pems = await selfsigned.generate(
      [{ name: 'commonName', value: 'localhost' }],
      {
        algorithm: 'sha256',
        days: 30,
        keySize: 2048,
        extensions: [
          {
            name: 'subjectAltName',
            altNames: hosts.map((host) => (
              /^\d+\.\d+\.\d+\.\d+$/.test(host)
                ? { type: 7, ip: host }
                : { type: 2, value: host }
            )),
          },
        ],
      }
    );

    writeFileSync(keyPath, pems.private, 'utf8');
    writeFileSync(certPath, pems.cert, 'utf8');
  }

  return {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
    keyPath,
    certPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetBaseUrl = args.get('target-base-url') || process.env.REY30_PROXY_TARGET || 'http://127.0.0.1:3000';
  const httpsHost = args.get('https-host') || process.env.REY30_HTTPS_HOST || 'localhost';
  const httpsPort = toPort(args.get('https-port') || process.env.REY30_HTTPS_PORT, 8443);
  const certDir = path.isAbsolute(args.get('cert-dir') || '')
    ? (args.get('cert-dir') || '')
    : path.join(process.cwd(), args.get('cert-dir') || 'output/local-certs');
  const targetUrl = new URL(targetBaseUrl);
  const certificate = await ensureCertificate(certDir, [httpsHost, '127.0.0.1']);
  const upstreamModule = targetUrl.protocol === 'https:' ? https : http;

  const server = https.createServer(
    {
      key: certificate.key,
      cert: certificate.cert,
    },
    (request, response) => {
      const upstreamRequest = upstreamModule.request(
        {
          protocol: targetUrl.protocol,
          hostname: targetUrl.hostname,
          port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
          method: request.method,
          path: request.url,
          headers: {
            ...request.headers,
            host: targetUrl.host,
            'x-forwarded-proto': 'https',
            'x-forwarded-host': `${httpsHost}:${httpsPort}`,
            'x-forwarded-port': String(httpsPort),
          },
          rejectUnauthorized: false,
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        }
      );

      upstreamRequest.on('error', (error) => {
        if (!response.headersSent) {
          response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
        }
        response.end(
          JSON.stringify({
            ok: false,
            error: 'upstream_proxy_error',
            detail: String(error?.message || error),
          })
        );
      });

      request.on('aborted', () => {
        upstreamRequest.destroy();
      });

      request.pipe(upstreamRequest);
    }
  );

  server.listen(httpsPort, httpsHost, () => {
    process.stdout.write(
      `HTTPS local proxy ready on https://${httpsHost}:${httpsPort} -> ${targetBaseUrl}\n`
    );
    process.stdout.write(`Certificate: ${certificate.certPath}\n`);
    process.stdout.write(`Private key: ${certificate.keyPath}\n`);
  });

  server.on('error', (error) => {
    process.stderr.write(`HTTPS local proxy server error: ${String(error?.message || error)}\n`);
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  process.stderr.write(`https-local-proxy failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
