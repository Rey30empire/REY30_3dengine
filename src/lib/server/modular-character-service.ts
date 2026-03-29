import crypto from 'crypto';
import { zipSync, strToU8 } from 'fflate';
import { db } from '@/lib/db';
import {
  DEFAULT_MODULAR_PROJECT_NAME,
  DEFAULT_MODULAR_PROJECT_SLUG,
  slugifyModularName,
  type ModularCharacterCreatePayload,
  type ModularCharacterDetailResponse,
  type ModularCharacterListResponse,
  type ModularCharacterMetadataRecord,
  type ModularPartManifestRecord,
  type SavedModularCharacterDetail,
  type SavedModularCharacterPartSummary,
  type SavedModularCharacterSummary,
  type SupportedModelFormat,
} from '@/engine/modular-character';
import { getModularMimeType } from '@/app/api/modular-characters/shared';
import {
  getModularCharacterStorageInfo,
  readModularBinary,
  readModularJson,
  writeModularBinary,
  writeModularJson,
} from './modular-character-storage';

function randomId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function buildCharacterRoot(projectSlug: string, slug: string, id: string) {
  return `${projectSlug}/${slug}_${id}`;
}

function buildPartMetadataFileName(slug: string) {
  return `metadata_${slug}.json`;
}

function buildDownloadUrls(characterId: string) {
  return {
    zipDownloadUrl: `/api/modular-characters/${characterId}/download`,
    originalDownloadUrl: `/api/modular-characters/${characterId}/original`,
  };
}

async function ensureProject(ownerId: string, projectName?: string, projectSlug?: string) {
  const name = (projectName || DEFAULT_MODULAR_PROJECT_NAME).trim() || DEFAULT_MODULAR_PROJECT_NAME;
  const slug = slugifyModularName(projectSlug || name || DEFAULT_MODULAR_PROJECT_SLUG, DEFAULT_MODULAR_PROJECT_SLUG);

  const existing = await db.modularCharacterProject.findFirst({
    where: {
      ownerId,
      slug,
    },
  });
  if (existing) return existing;

  return db.modularCharacterProject.create({
    data: {
      ownerId,
      name,
      slug,
      description: 'Proyecto base para modularizacion de personajes 3D.',
    },
  });
}

async function ensureUniqueCharacterSlug(ownerId: string, desiredName: string) {
  const baseSlug = slugifyModularName(desiredName, 'character');
  const existing = await db.modularCharacter.findFirst({
    where: {
      ownerId,
      slug: baseSlug,
    },
  });
  if (!existing) return baseSlug;
  return `${baseSlug}-${Date.now().toString().slice(-6)}`;
}

function buildPartManifest(params: {
  characterRoot: string;
  partFilesByName: Map<string, File>;
  payload: ModularCharacterCreatePayload;
  previewPath: string | null;
}): ModularPartManifestRecord[] {
  return params.payload.assignments.map((assignment) => {
    const partFile = params.partFilesByName.get(assignment.exportFileName);
    const partSlug = slugifyModularName(assignment.label, assignment.partType);
    const storagePath = `${params.characterRoot}/parts/${partSlug}/${assignment.exportFileName}`;
    const metadataPath = `${params.characterRoot}/parts/${partSlug}/${buildPartMetadataFileName(partSlug)}`;

    return {
      id: randomId(),
      name: assignment.label,
      slug: partSlug,
      partType: assignment.partType,
      exportFormat: 'glb',
      originalFormat: params.payload.analysis.sourceFormat,
      sourceNodePaths: assignment.nodePaths,
      materialNames: assignment.materialNames,
      textureNames: assignment.textureNames,
      hasRig: assignment.hasRig,
      boneNames: assignment.boneNames,
      pivot: assignment.pivot,
      scale: { x: 1, y: 1, z: 1 },
      boundingBox: assignment.boundingBox,
      connectionPoints: assignment.connectionPoints,
      compatibility: assignment.compatibility,
      storagePath,
      metadataPath,
      previewPath: params.previewPath,
    };
  });
}

function buildUnityManifest(metadata: ModularCharacterMetadataRecord) {
  return {
    version: 1,
    characterId: metadata.id,
    name: metadata.name,
    slug: metadata.slug,
    exportProfile: metadata.exportProfile,
    sourceFormat: metadata.sourceFormat,
    orientation: {
      upAxis: 'Y',
      forwardAxis: 'Z',
      scaleUnit: 'meters',
    },
    parts: metadata.parts.map((part) => ({
      id: part.id,
      slug: part.slug,
      name: part.name,
      partType: part.partType,
      storagePath: part.storagePath,
      hasRig: part.hasRig,
      boneNames: part.boneNames,
      pivot: part.pivot,
      connectionPoints: part.connectionPoints,
    })),
  };
}

async function writeCharacterBundle(params: {
  characterRoot: string;
  metadata: ModularCharacterMetadataRecord;
  sourceFiles: File[];
  partFilesByName: Map<string, File>;
  previewFile: File | null;
}) {
  for (const file of params.sourceFiles) {
    const data = Buffer.from(await file.arrayBuffer());
    await writeModularBinary({
      relativePath: `${params.characterRoot}/full_model/${file.name}`,
      data,
      contentType: file.type || getModularMimeType(file.name),
    });
  }

  for (const part of params.metadata.parts) {
    const file = params.partFilesByName.get(part.storagePath.split('/').pop() || '');
    if (!file) continue;

    const data = Buffer.from(await file.arrayBuffer());
    await writeModularBinary({
      relativePath: part.storagePath,
      data,
      contentType: file.type || getModularMimeType(file.name),
    });
    await writeModularJson({
      relativePath: part.metadataPath,
      data: part,
    });
  }

  if (params.previewFile && params.metadata.previewPath) {
    await writeModularBinary({
      relativePath: params.metadata.previewPath,
      data: Buffer.from(await params.previewFile.arrayBuffer()),
      contentType: params.previewFile.type || 'image/png',
    });
  }

  await writeModularJson({
    relativePath: params.metadata.manifestPath,
    data: params.metadata,
  });
  await writeModularJson({
    relativePath: params.metadata.unityManifestPath,
    data: buildUnityManifest(params.metadata),
  });
}

function toPartSummary(characterId: string, part: {
  id: string;
  name: string;
  slug: string;
  partType: string;
  hasRig: boolean;
  metadataJson: string;
}) {
  const metadata = JSON.parse(part.metadataJson) as ModularPartManifestRecord;
  return {
    id: part.id,
    name: part.name,
    slug: part.slug,
    partType: part.partType as SavedModularCharacterPartSummary['partType'],
    hasRig: part.hasRig,
    materialNames: metadata.materialNames,
    boneNames: metadata.boneNames,
    downloadUrl: `/api/modular-characters/${characterId}/parts/${part.id}/download`,
  } satisfies SavedModularCharacterPartSummary;
}

function toCharacterSummary(record: {
  id: string;
  projectId: string | null;
  project: { name: string; slug: string } | null;
  name: string;
  slug: string;
  exportProfile: string;
  sourceFormat: string;
  meshCount: number;
  materialCount: number;
  animationCount: number;
  hasRig: boolean;
  createdAt: Date;
  updatedAt: Date;
  parts: Array<{
    id: string;
    name: string;
    slug: string;
    partType: string;
    hasRig: boolean;
    metadataJson: string;
  }>;
}) {
  const urls = buildDownloadUrls(record.id);
  return {
    id: record.id,
    projectId: record.projectId,
    projectName: record.project?.name || DEFAULT_MODULAR_PROJECT_NAME,
    projectSlug: record.project?.slug || DEFAULT_MODULAR_PROJECT_SLUG,
    name: record.name,
    slug: record.slug,
    exportProfile: record.exportProfile as SavedModularCharacterSummary['exportProfile'],
    sourceFormat: record.sourceFormat as SupportedModelFormat,
    meshCount: record.meshCount,
    materialCount: record.materialCount,
    animationCount: record.animationCount,
    hasRig: record.hasRig,
    partCount: record.parts.length,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    downloadUrl: urls.zipDownloadUrl,
    originalDownloadUrl: urls.originalDownloadUrl,
    parts: record.parts.map((part) => toPartSummary(record.id, part)),
  } satisfies SavedModularCharacterSummary;
}

export async function createModularCharacter(params: {
  ownerId: string;
  payload: ModularCharacterCreatePayload;
  sourceFiles: File[];
  partFiles: File[];
  previewFile?: File | null;
}) {
  const project = await ensureProject(
    params.ownerId,
    params.payload.projectName,
    params.payload.projectSlug
  );
  const slug = await ensureUniqueCharacterSlug(params.ownerId, params.payload.name);
  const characterId = randomId();
  const storage = getModularCharacterStorageInfo();
  const characterRoot = buildCharacterRoot(project.slug, slug, characterId);
  const previewFile = params.previewFile || null;
  const previewPath = previewFile ? `${characterRoot}/preview/preview.png` : null;
  const partFilesByName = new Map(params.partFiles.map((file) => [file.name, file]));
  const parts = buildPartManifest({
    characterRoot,
    partFilesByName,
    payload: params.payload,
    previewPath,
  });

  const originalPath = `${characterRoot}/full_model/${params.payload.sourcePrimaryFileName}`;
  const manifestPath = `${characterRoot}/metadata.json`;
  const unityManifestPath = `${characterRoot}/unity-ready/assembly.json`;

  const metadata: ModularCharacterMetadataRecord = {
    id: characterId,
    projectId: project.id,
    projectSlug: project.slug,
    name: params.payload.name,
    slug,
    exportProfile: params.payload.exportProfile,
    sourceFormat: params.payload.analysis.sourceFormat,
    originalDownloadMode: params.sourceFiles.length > 1 ? 'bundle' : 'single-file',
    storageBackend: storage.backend,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceFiles: params.payload.analysis.sourceFiles,
    previewPath,
    originalPath,
    originalFiles: params.sourceFiles.map((file) => `${characterRoot}/full_model/${file.name}`),
    manifestPath,
    unityManifestPath,
    analysis: params.payload.analysis,
    parts,
  };

  await writeCharacterBundle({
    characterRoot,
    metadata,
    sourceFiles: params.sourceFiles,
    partFilesByName,
    previewFile,
  });

  await db.$transaction(async (tx) => {
    await tx.modularCharacter.create({
      data: {
        id: characterId,
        ownerId: params.ownerId,
        projectId: project.id,
        name: params.payload.name,
        slug,
        exportProfile: params.payload.exportProfile,
        sourceFormat: params.payload.analysis.sourceFormat,
        sourceFileName: params.payload.sourcePrimaryFileName,
        sourceMimeType:
          params.sourceFiles.find((file) => file.name === params.payload.sourcePrimaryFileName)?.type ||
          getModularMimeType(params.payload.sourcePrimaryFileName),
        sourceSize: params.payload.analysis.sourceSize,
        meshCount: params.payload.analysis.meshCount,
        materialCount: params.payload.analysis.materialCount,
        boneCount: params.payload.analysis.boneCount,
        animationCount: params.payload.analysis.animationCount,
        hasRig: params.payload.analysis.hasRig,
        isStatic: params.payload.exportProfile === 'static-modular',
        storageBackend: storage.backend === 'netlify-blobs' ? 'NETLIFY_BLOBS' : 'FILESYSTEM',
        sourcePath: originalPath,
        previewPath,
        manifestPath,
        unityManifestPath,
        metadataJson: JSON.stringify(metadata),
        analysisJson: JSON.stringify(params.payload.analysis),
      },
    });

    if (params.sourceFiles.length > 0) {
      await tx.modularCharacterUpload.createMany({
        data: params.sourceFiles.map((file) => ({
          id: randomId(),
          ownerId: params.ownerId,
          projectId: project.id,
          characterId,
          fileName: file.name,
          mimeType: file.type || getModularMimeType(file.name),
          fileSize: file.size,
          sourceFormat:
            file.name === params.payload.sourcePrimaryFileName
              ? params.payload.analysis.sourceFormat
              : 'resource',
          storagePath: `${characterRoot}/full_model/${file.name}`,
          metadataJson: JSON.stringify({
            isPrimary: file.name === params.payload.sourcePrimaryFileName,
          }),
        })),
      });
    }

    if (parts.length > 0) {
      await tx.modularCharacterPart.createMany({
        data: parts.map((part) => ({
          id: part.id,
          characterId,
          name: part.name,
          slug: part.slug,
          partType: part.partType,
          category: part.partType,
          sourceFormat: params.payload.analysis.sourceFormat,
          exportFormat: part.exportFormat,
          sourceNodePathsJson: JSON.stringify(part.sourceNodePaths),
          storagePath: part.storagePath,
          metadataPath: part.metadataPath,
          previewPath: part.previewPath,
          materialCount: part.materialNames.length,
          hasRig: part.hasRig,
          metadataJson: JSON.stringify(part),
        })),
      });
    }
  });

  return {
    item: await getModularCharacterDetail(params.ownerId, characterId),
  };
}

export async function listModularCharacters(ownerId: string): Promise<ModularCharacterListResponse> {
  const records = await db.modularCharacter.findMany({
    where: {
      ownerId,
    },
    include: {
      project: true,
      parts: true,
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return {
    items: records.map((record) => toCharacterSummary(record)),
  };
}

export async function getModularCharacterDetail(
  ownerId: string,
  characterId: string
): Promise<SavedModularCharacterDetail> {
  const record = await db.modularCharacter.findFirst({
    where: {
      id: characterId,
      ownerId,
    },
    include: {
      project: true,
      parts: true,
    },
  });

  if (!record) {
    throw new Error('NOT_FOUND');
  }

  const summary = toCharacterSummary(record);
  const metadata = (await readModularJson<ModularCharacterMetadataRecord>(record.manifestPath)) ||
    (JSON.parse(record.metadataJson) as ModularCharacterMetadataRecord);

  return {
    ...summary,
    metadata,
  };
}

async function writeExportRecord(params: {
  ownerId: string;
  projectId: string | null;
  characterId: string;
  exportKind: 'FULL_ZIP' | 'SELECTED_PARTS' | 'ORIGINAL_BUNDLE' | 'SINGLE_PART';
  format: string;
  storagePath: string;
  fileSize: number;
  manifestJson?: string;
}) {
  await db.modularCharacterExport.create({
    data: {
      id: randomId(),
      ownerId: params.ownerId,
      projectId: params.projectId,
      characterId: params.characterId,
      exportKind: params.exportKind,
      format: params.format,
      storagePath: params.storagePath,
      fileSize: params.fileSize,
      manifestJson: params.manifestJson || null,
    },
  });
}

export async function buildModularCharacterZip(params: {
  ownerId: string;
  characterId: string;
  selectedPartIds?: string[];
}) {
  const detail = await getModularCharacterDetail(params.ownerId, params.characterId);
  const selectedParts =
    params.selectedPartIds && params.selectedPartIds.length > 0
      ? detail.metadata.parts.filter((part) => params.selectedPartIds?.includes(part.id))
      : detail.metadata.parts;

  const zipEntries: Record<string, Uint8Array> = {
    'metadata.json': strToU8(JSON.stringify(detail.metadata, null, 2)),
    'unity-ready/assembly.json': strToU8(
      JSON.stringify(buildUnityManifest(detail.metadata), null, 2)
    ),
  };

  for (const relativePath of detail.metadata.originalFiles) {
    const file = await readModularBinary(relativePath);
    if (!file) continue;
    const zipPath = relativePath.replace(`${detail.metadata.projectSlug}/${detail.slug}_${detail.id}/`, '');
    zipEntries[zipPath] = new Uint8Array(file.buffer);
  }

  for (const part of selectedParts) {
    const file = await readModularBinary(part.storagePath);
    const metadata = await readModularBinary(part.metadataPath);
    if (file) {
      zipEntries[`parts/${part.slug}/${part.storagePath.split('/').pop() || part.slug}.glb`] =
        new Uint8Array(file.buffer);
    }
    if (metadata) {
      zipEntries[`parts/${part.slug}/metadata.json`] = new Uint8Array(metadata.buffer);
    }
  }

  if (detail.metadata.previewPath) {
    const preview = await readModularBinary(detail.metadata.previewPath);
    if (preview) {
      zipEntries['preview/preview.png'] = new Uint8Array(preview.buffer);
    }
  }

  const zipData = zipSync(zipEntries, { level: 6 });
  const suffix = params.selectedPartIds && params.selectedPartIds.length > 0 ? 'selected-parts' : 'full';
  const fileName = `${detail.slug}-${suffix}.zip`;
  const storagePath = `${detail.metadata.projectSlug}/${detail.slug}_${detail.id}/exports/${fileName}`;

  await writeModularBinary({
    relativePath: storagePath,
    data: zipData,
    contentType: 'application/zip',
  });
  await writeExportRecord({
    ownerId: params.ownerId,
    projectId: detail.projectId,
    characterId: detail.id,
    exportKind:
      params.selectedPartIds && params.selectedPartIds.length > 0 ? 'SELECTED_PARTS' : 'FULL_ZIP',
    format: 'zip',
    storagePath,
    fileSize: zipData.byteLength,
    manifestJson: JSON.stringify({
      selectedPartIds: params.selectedPartIds || [],
    }),
  });

  return {
    fileName,
    buffer: Buffer.from(zipData),
    contentType: 'application/zip',
  };
}

export async function readModularCharacterOriginal(params: {
  ownerId: string;
  characterId: string;
}) {
  const detail = await getModularCharacterDetail(params.ownerId, params.characterId);
  if (detail.metadata.originalDownloadMode === 'single-file') {
    const file = await readModularBinary(detail.metadata.originalPath);
    if (!file) throw new Error('NOT_FOUND');
    return {
      fileName: detail.metadata.originalPath.split('/').pop() || `${detail.slug}.${detail.sourceFormat}`,
      buffer: file.buffer,
      contentType: file.metadata.contentType || getModularMimeType(detail.metadata.originalPath),
    };
  }

  const zipEntries: Record<string, Uint8Array> = {};
  for (const relativePath of detail.metadata.originalFiles) {
    const file = await readModularBinary(relativePath);
    if (!file) continue;
    zipEntries[relativePath.replace(`${detail.metadata.projectSlug}/${detail.slug}_${detail.id}/`, '')] =
      new Uint8Array(file.buffer);
  }

  const zipData = zipSync(zipEntries, { level: 6 });
  const fileName = `${detail.slug}-source-bundle.zip`;
  const storagePath = `${detail.metadata.projectSlug}/${detail.slug}_${detail.id}/exports/${fileName}`;
  await writeModularBinary({
    relativePath: storagePath,
    data: zipData,
    contentType: 'application/zip',
  });
  await writeExportRecord({
    ownerId: params.ownerId,
    projectId: detail.projectId,
    characterId: detail.id,
    exportKind: 'ORIGINAL_BUNDLE',
    format: 'zip',
    storagePath,
    fileSize: zipData.byteLength,
  });

  return {
    fileName,
    buffer: Buffer.from(zipData),
    contentType: 'application/zip',
  };
}

export async function readModularCharacterPart(params: {
  ownerId: string;
  characterId: string;
  partId: string;
}) {
  const detail = await getModularCharacterDetail(params.ownerId, params.characterId);
  const part = detail.metadata.parts.find((entry) => entry.id === params.partId);
  if (!part) {
    throw new Error('NOT_FOUND');
  }

  const file = await readModularBinary(part.storagePath);
  if (!file) {
    throw new Error('NOT_FOUND');
  }

  await writeExportRecord({
    ownerId: params.ownerId,
    projectId: detail.projectId,
    characterId: detail.id,
    exportKind: 'SINGLE_PART',
    format: 'glb',
    storagePath: part.storagePath,
    fileSize: file.buffer.byteLength,
    manifestJson: JSON.stringify({ partId: part.id }),
  });

  return {
    fileName: part.storagePath.split('/').pop() || `${part.slug}.glb`,
    buffer: file.buffer,
    contentType: file.metadata.contentType || 'model/gltf-binary',
  };
}

export async function getModularCharacterApiResponse(params: {
  ownerId: string;
  characterId: string;
}): Promise<ModularCharacterDetailResponse> {
  return {
    item: await getModularCharacterDetail(params.ownerId, params.characterId),
  };
}
