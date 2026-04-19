import {
  getAssetSystemStatePath,
  readJsonFileAtPath,
  runAssetSystemMutation,
  writeJsonFileAtomic,
} from '@/lib/server/asset-system-storage';
import type { CharacterPackageSummary } from '@/lib/character-package';

export type CharacterGenerationJobRecord = {
  jobId: string;
  userId: string;
  projectKey: string;
  prompt: string;
  style: string;
  targetEngine: string;
  includeAnimations: boolean;
  includeBlendshapes: boolean;
  references: string[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  progress: number;
  stage: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  remotePackagePath: string | null;
  packageDirectoryPath: string | null;
  packageSummary: CharacterPackageSummary | null;
  asset:
    | {
        id: string;
        name: string;
        type: 'prefab';
        path: string;
        size: number;
        createdAt: string;
        metadata: Record<string, unknown>;
      }
    | null;
};

type CharacterGenerationStoreDocument = {
  schemaVersion: number;
  jobs: CharacterGenerationJobRecord[];
};

const STORE_FILE_NAME = 'character-generation-jobs.json';
const STORE_SCHEMA_VERSION = 1;

function getStorePath() {
  return getAssetSystemStatePath(STORE_FILE_NAME);
}

async function readStore(): Promise<CharacterGenerationStoreDocument> {
  const existing = await readJsonFileAtPath<CharacterGenerationStoreDocument>(getStorePath());
  if (!existing || !Array.isArray(existing.jobs)) {
    return {
      schemaVersion: STORE_SCHEMA_VERSION,
      jobs: [],
    };
  }

  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    jobs: existing.jobs.filter((job): job is CharacterGenerationJobRecord => Boolean(job?.jobId)),
  };
}

async function writeStore(store: CharacterGenerationStoreDocument) {
  await writeJsonFileAtomic(getStorePath(), {
    schemaVersion: STORE_SCHEMA_VERSION,
    jobs: store.jobs,
  });
}

export async function getCharacterGenerationJobRecord(jobId: string) {
  const store = await readStore();
  return store.jobs.find((job) => job.jobId === jobId) ?? null;
}

export async function upsertCharacterGenerationJobRecord(
  params: Omit<
    CharacterGenerationJobRecord,
    'createdAt' | 'updatedAt' | 'progress' | 'stage' | 'error' | 'remotePackagePath' | 'packageDirectoryPath' | 'packageSummary' | 'asset'
  > & {
    progress?: number;
    stage?: string;
    error?: string | null;
    remotePackagePath?: string | null;
    packageDirectoryPath?: string | null;
    packageSummary?: CharacterPackageSummary | null;
    asset?: CharacterGenerationJobRecord['asset'];
  }
) {
  return runAssetSystemMutation(async () => {
    const store = await readStore();
    const now = new Date().toISOString();
    const existingIndex = store.jobs.findIndex((job) => job.jobId === params.jobId);
    const nextRecord: CharacterGenerationJobRecord = {
      jobId: params.jobId,
      userId: params.userId,
      projectKey: params.projectKey,
      prompt: params.prompt,
      style: params.style,
      targetEngine: params.targetEngine,
      includeAnimations: params.includeAnimations,
      includeBlendshapes: params.includeBlendshapes,
      references: params.references,
      status: params.status,
      progress: params.progress ?? (params.status === 'completed' || params.status === 'canceled' ? 100 : 0),
      stage: params.stage ?? params.status,
      error: params.error ?? null,
      createdAt:
        existingIndex >= 0 ? store.jobs[existingIndex]!.createdAt : now,
      updatedAt: now,
      remotePackagePath: params.remotePackagePath ?? null,
      packageDirectoryPath: params.packageDirectoryPath ?? null,
      packageSummary: params.packageSummary ?? null,
      asset: params.asset ?? null,
    };

    if (existingIndex >= 0) {
      store.jobs[existingIndex] = {
        ...store.jobs[existingIndex]!,
        ...nextRecord,
        createdAt: store.jobs[existingIndex]!.createdAt,
      };
    } else {
      store.jobs.push(nextRecord);
    }

    await writeStore(store);
    return store.jobs.find((job) => job.jobId === params.jobId)!;
  });
}

export async function patchCharacterGenerationJobRecord(
  jobId: string,
  updater: (current: CharacterGenerationJobRecord) => CharacterGenerationJobRecord
) {
  return runAssetSystemMutation(async () => {
    const store = await readStore();
    const index = store.jobs.findIndex((job) => job.jobId === jobId);
    if (index < 0) {
      return null;
    }

    const current = store.jobs[index]!;
    store.jobs[index] = {
      ...updater(current),
      jobId: current.jobId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await writeStore(store);
    return store.jobs[index]!;
  });
}

export async function clearCharacterGenerationStoreForTest() {
  return runAssetSystemMutation(async () => {
    await writeStore({
      schemaVersion: STORE_SCHEMA_VERSION,
      jobs: [],
    });
  });
}
