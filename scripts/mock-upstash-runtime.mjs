import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';

function trim(value) {
  return String(value || '').trim();
}

function json(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function parseBearerToken(header) {
  const value = trim(header);
  if (!value.toLowerCase().startsWith('bearer ')) return '';
  return trim(value.slice('bearer '.length));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function cleanupExpired(store, key, now = Date.now()) {
  const current = store.get(key);
  if (!current) return null;
  if (typeof current.expiresAt === 'number' && current.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return current;
}

function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to find a free port for the mock Upstash server.'));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function executeCommand(store, rawCommand) {
  const command = Array.isArray(rawCommand) ? rawCommand : [];
  const [operation, rawKey, ...args] = command;
  const op = trim(operation).toUpperCase();
  const key = trim(rawKey);
  const now = Date.now();
  const current = key ? cleanupExpired(store, key, now) : null;

  if (op === 'INCR') {
    if (!key) {
      return { error: 'ERR missing key' };
    }
    const next = {
      value: (current?.value || 0) + 1,
      expiresAt: current?.expiresAt || null,
    };
    store.set(key, next);
    return { result: next.value };
  }

  if (op === 'EXPIRE') {
    if (!key) {
      return { error: 'ERR missing key' };
    }

    const ttlSeconds = Number(args[0]);
    const mode = trim(args[1]).toUpperCase();
    if (!current || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return { result: 0 };
    }

    if (mode === 'NX' && typeof current.expiresAt === 'number') {
      return { result: 0 };
    }

    current.expiresAt = now + ttlSeconds * 1000;
    store.set(key, current);
    return { result: 1 };
  }

  if (op === 'PTTL') {
    if (!key || !current) {
      return { result: -2 };
    }
    if (typeof current.expiresAt !== 'number') {
      return { result: -1 };
    }
    return { result: Math.max(0, current.expiresAt - now) };
  }

  return { error: `ERR unsupported command ${op || 'unknown'}` };
}

export async function startMockUpstashServer(options = {}) {
  const host = trim(options.host) || '127.0.0.1';
  const token = trim(options.token) || crypto.randomBytes(24).toString('hex');
  const requestedPort = Number(options.port);
  const port = Number.isFinite(requestedPort) && requestedPort > 0
    ? Math.floor(requestedPort)
    : await findFreePort(host);
  const store = new Map();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${host}:${port}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      json(response, 200, { ok: true, status: 'healthy' });
      return;
    }

    if (request.method !== 'POST' || url.pathname !== '/pipeline') {
      json(response, 404, { error: 'Not found' });
      return;
    }

    if (parseBearerToken(request.headers.authorization) !== token) {
      json(response, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      const rawBody = await readBody(request);
      const pipeline = JSON.parse(rawBody || '[]');
      if (!Array.isArray(pipeline)) {
        json(response, 400, { error: 'Pipeline body must be an array.' });
        return;
      }

      const results = pipeline.map((command) => executeCommand(store, command));
      json(response, 200, results);
    } catch (error) {
      json(response, 400, { error: `Invalid pipeline payload: ${String(error?.message || error)}` });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  let stopped = false;
  return {
    host,
    port,
    token,
    url: `http://${host}:${port}`,
    async stop() {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
