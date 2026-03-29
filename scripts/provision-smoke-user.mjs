import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient, UserRole } from '@prisma/client';
import { resolveDatabaseUrl } from './env-utils.mjs';

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  return args;
}

function trim(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return trim(value).toLowerCase();
}

function normalizeRole(value) {
  if (value === UserRole.OWNER) return UserRole.OWNER;
  if (value === UserRole.EDITOR) return UserRole.EDITOR;
  return UserRole.VIEWER;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

export function buildDefaultSmokeCredentials(options = {}) {
  const prefix = trim(options.prefix || 'production');
  return {
    email: `${prefix}-smoke@localhost`,
    password: `Rey30Smoke!${crypto.randomBytes(6).toString('hex')}`,
  };
}

async function writeReport(reportPath, payload) {
  if (!trim(reportPath)) return;

  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function ensureSmokeUser(options = {}) {
  const env = options.env || process.env;
  const databaseUrl = trim(options.databaseUrl || resolveDatabaseUrl(env));
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to provision the smoke user.');
  }

  const email = normalizeEmail(options.email || env.SMOKE_USER_EMAIL);
  const password = trim(options.password || env.SMOKE_USER_PASSWORD);
  if (!email || !password) {
    throw new Error('SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD are required.');
  }

  const role = normalizeRole(options.role || env.SMOKE_USER_ROLE);
  const name = trim(options.name || env.SMOKE_USER_NAME) || 'Production Smoke User';
  const prisma =
    options.prisma ||
    new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  const ownsPrisma = !options.prisma;

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        role,
        passwordHash: hashPassword(password),
        isActive: true,
        lastLoginAt: new Date(),
      },
      create: {
        email,
        name,
        role,
        passwordHash: hashPassword(password),
        isActive: true,
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    await prisma.authSession.deleteMany({
      where: { userId: user.id },
    });

    return {
      ok: true,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  } finally {
    if (ownsPrisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const credentials = buildDefaultSmokeCredentials({
    prefix: trim(args.get('prefix')) || 'production',
  });
  const result = await ensureSmokeUser({
    databaseUrl: args.get('database-url') || resolveDatabaseUrl(process.env),
    email: args.get('email') || process.env.SMOKE_USER_EMAIL || credentials.email,
    password: args.get('password') || process.env.SMOKE_USER_PASSWORD || credentials.password,
    name: args.get('name') || process.env.SMOKE_USER_NAME,
    role: args.get('role') || process.env.SMOKE_USER_ROLE,
  });

  await writeReport(args.get('report-path') || '', result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`provision-smoke-user failed: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
