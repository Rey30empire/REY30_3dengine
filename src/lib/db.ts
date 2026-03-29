import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolvePrismaProvider(): string {
  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma')
  if (!existsSync(schemaPath)) return 'sqlite'

  try {
    const schema = readFileSync(schemaPath, 'utf8')
    const providerMatch = schema.match(/datasource\s+\w+\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"/m)
    return providerMatch?.[1] || 'sqlite'
  } catch {
    return 'sqlite'
  }
}

const fallbackDatabaseFileCandidates = [
  ['prisma', 'prisma', 'dev.db'],
  ['prisma', 'dev.db'],
  ['db', 'custom.db'],
]
const configuredPrismaProvider = resolvePrismaProvider()
const fallbackDatabaseFile =
  fallbackDatabaseFileCandidates
    .map((segments) => path.resolve(process.cwd(), ...segments))
    .find((filePath) => existsSync(filePath)) ?? path.resolve(process.cwd(), 'prisma', 'prisma', 'dev.db')
const fallbackDatabaseUrl =
  configuredPrismaProvider === 'sqlite'
    ? `file:${fallbackDatabaseFile.replace(/\\/g, '/')}`
    : undefined
const resolvedDatabaseUrl =
  process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || fallbackDatabaseUrl

if (!process.env.DATABASE_URL && resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl
}

function createPrismaClient() {
  if (!resolvedDatabaseUrl && configuredPrismaProvider !== 'sqlite') {
    throw new Error(
      `DATABASE_URL is required for Prisma provider "${configuredPrismaProvider}".`
    )
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
    ...(resolvedDatabaseUrl
      ? {
          datasources: {
            db: { url: resolvedDatabaseUrl },
          },
        }
      : {}),
  })
}

function getOrCreatePrismaClient() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const prisma = createPrismaClient()
  globalForPrisma.prisma = prisma

  return prisma
}

// Keep Prisma lazy so pure helper imports do not require a live DATABASE_URL.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const prisma = getOrCreatePrismaClient()
    const value = Reflect.get(prisma as object, property, receiver)
    return typeof value === 'function' ? value.bind(prisma) : value
  },
}) as PrismaClient
