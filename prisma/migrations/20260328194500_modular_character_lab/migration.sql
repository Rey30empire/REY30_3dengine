-- CreateEnum
CREATE TYPE "ModularStorageBackend" AS ENUM ('FILESYSTEM', 'NETLIFY_BLOBS');

-- CreateEnum
CREATE TYPE "ModularExportKind" AS ENUM ('FULL_ZIP', 'SELECTED_PARTS', 'ORIGINAL_BUNDLE', 'SINGLE_PART');

-- CreateTable
CREATE TABLE "ModularCharacterProject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModularCharacterProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModularCharacter" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "exportProfile" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceMimeType" TEXT NOT NULL,
    "sourceSize" INTEGER NOT NULL,
    "meshCount" INTEGER NOT NULL DEFAULT 0,
    "materialCount" INTEGER NOT NULL DEFAULT 0,
    "boneCount" INTEGER NOT NULL DEFAULT 0,
    "animationCount" INTEGER NOT NULL DEFAULT 0,
    "hasRig" BOOLEAN NOT NULL DEFAULT false,
    "isStatic" BOOLEAN NOT NULL DEFAULT false,
    "storageBackend" "ModularStorageBackend" NOT NULL DEFAULT 'FILESYSTEM',
    "sourcePath" TEXT NOT NULL,
    "previewPath" TEXT,
    "manifestPath" TEXT NOT NULL,
    "unityManifestPath" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL,
    "analysisJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModularCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModularCharacterPart" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "partType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "exportFormat" TEXT NOT NULL,
    "sourceNodePathsJson" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "metadataPath" TEXT NOT NULL,
    "previewPath" TEXT,
    "materialCount" INTEGER NOT NULL DEFAULT 0,
    "hasRig" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModularCharacterPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModularCharacterUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "characterId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModularCharacterUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModularCharacterExport" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "characterId" TEXT NOT NULL,
    "exportKind" "ModularExportKind" NOT NULL,
    "format" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "manifestJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModularCharacterExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModularCharacterProject_ownerId_slug_key" ON "ModularCharacterProject"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "ModularCharacterProject_ownerId_createdAt_idx" ON "ModularCharacterProject"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModularCharacter_ownerId_slug_key" ON "ModularCharacter"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "ModularCharacter_ownerId_createdAt_idx" ON "ModularCharacter"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ModularCharacter_projectId_createdAt_idx" ON "ModularCharacter"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModularCharacterPart_characterId_slug_key" ON "ModularCharacterPart"("characterId", "slug");

-- CreateIndex
CREATE INDEX "ModularCharacterPart_characterId_partType_idx" ON "ModularCharacterPart"("characterId", "partType");

-- CreateIndex
CREATE INDEX "ModularCharacterUpload_ownerId_createdAt_idx" ON "ModularCharacterUpload"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ModularCharacterUpload_characterId_createdAt_idx" ON "ModularCharacterUpload"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "ModularCharacterExport_characterId_createdAt_idx" ON "ModularCharacterExport"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "ModularCharacterExport_ownerId_createdAt_idx" ON "ModularCharacterExport"("ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ModularCharacterProject" ADD CONSTRAINT "ModularCharacterProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacter" ADD CONSTRAINT "ModularCharacter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacter" ADD CONSTRAINT "ModularCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ModularCharacterProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacterPart" ADD CONSTRAINT "ModularCharacterPart_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ModularCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacterUpload" ADD CONSTRAINT "ModularCharacterUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacterUpload" ADD CONSTRAINT "ModularCharacterUpload_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ModularCharacterProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacterUpload" ADD CONSTRAINT "ModularCharacterUpload_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ModularCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacterExport" ADD CONSTRAINT "ModularCharacterExport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacterExport" ADD CONSTRAINT "ModularCharacterExport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ModularCharacterProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModularCharacterExport" ADD CONSTRAINT "ModularCharacterExport_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ModularCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
