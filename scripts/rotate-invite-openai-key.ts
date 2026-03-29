import { loadWorkspaceEnv } from './env-utils.mjs';

loadWorkspaceEnv({
  envFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
});

function trim(value: unknown): string {
  return String(value || '').trim();
}

function detectEncryptionKeyName(): string {
  if (trim(process.env.REY30_ENCRYPTION_KEY)) return 'REY30_ENCRYPTION_KEY';
  if (trim(process.env.APP_ENCRYPTION_KEY)) return 'APP_ENCRYPTION_KEY';
  if (trim(process.env.NEXTAUTH_SECRET)) return 'NEXTAUTH_SECRET';
  return 'missing';
}

function defaultSharedAccessProfile() {
  return {
    email: trim(process.env.REY30_SHARED_ACCESS_EMAIL) || 'shared-access@rey30.local',
    name: trim(process.env.REY30_SHARED_ACCESS_NAME) || 'REY30 Shared Access',
    role: trim(process.env.REY30_SHARED_ACCESS_ROLE).toUpperCase() || 'OWNER',
  };
}

async function main() {
  const nextOpenAIKey = trim(process.env.INVITE_PROFILE_OPENAI_API_KEY);
  if (!nextOpenAIKey) {
    throw new Error(
      'Missing INVITE_PROFILE_OPENAI_API_KEY. Export the new key and rerun the script.'
    );
  }

  const encryptionKeyName = detectEncryptionKeyName();
  if (encryptionKeyName === 'missing') {
    throw new Error(
      'Missing encryption secret. Define REY30_ENCRYPTION_KEY, APP_ENCRYPTION_KEY, or NEXTAUTH_SECRET before rotating invite credentials.'
    );
  }

  const [{ db }, { encryptText, decryptText }, { DEFAULT_API_CONFIG }, { ApiProvider }] =
    await Promise.all([
      import('../src/lib/db'),
      import('../src/lib/security/crypto'),
      import('../src/lib/api-config'),
      import('../src/lib/domain-enums'),
    ]);

  const profile = defaultSharedAccessProfile();

  const user = await db.user.upsert({
    where: { email: profile.email },
    create: {
      email: profile.email,
      name: profile.name,
      role: profile.role as 'OWNER' | 'EDITOR' | 'VIEWER',
      isActive: true,
    },
    update: {
      name: profile.name,
      role: profile.role as 'OWNER' | 'EDITOR' | 'VIEWER',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  const existingCredential = await db.apiCredential.findUnique({
    where: {
      userId_provider: {
        userId: user.id,
        provider: ApiProvider.OPENAI,
      },
    },
  });

  let configWithoutSecret: Record<string, unknown> = {
    ...DEFAULT_API_CONFIG.openai,
  };
  delete (configWithoutSecret as { apiKey?: string }).apiKey;

  if (existingCredential?.encryptedConfig) {
    try {
      const decrypted = JSON.parse(
        decryptText(existingCredential.encryptedConfig)
      ) as Record<string, unknown>;
      configWithoutSecret = {
        ...configWithoutSecret,
        ...decrypted,
      };
      delete (configWithoutSecret as { apiKey?: string }).apiKey;
    } catch {
      // Preserve a safe default config if old config cannot be parsed.
    }
  }

  await db.apiCredential.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider: ApiProvider.OPENAI,
      },
    },
    create: {
      userId: user.id,
      provider: ApiProvider.OPENAI,
      enabled: true,
      hasApiKey: true,
      encryptedApiKey: encryptText(nextOpenAIKey),
      encryptedConfig: encryptText(JSON.stringify(configWithoutSecret)),
    },
    update: {
      enabled: true,
      hasApiKey: true,
      encryptedApiKey: encryptText(nextOpenAIKey),
      encryptedConfig: encryptText(JSON.stringify(configWithoutSecret)),
    },
  });

  process.stdout.write(
    [
      'Invite/shared OpenAI key rotated successfully.',
      `Profile email: ${user.email}`,
      `Profile role: ${user.role}`,
      `Encryption key source: ${encryptionKeyName}`,
      'Stored in database: yes',
      'The raw OpenAI key was not printed.',
      '',
    ].join('\n')
  );

  await db.$disconnect();
}

main().catch((error) => {
  process.stderr.write(`rotate-invite-openai-key failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
