import { statSync } from 'node:fs';
import path from 'node:path';
import type { ArtifactVerifier, ArtifactVerification } from './FinalDeliveryValidatorAgent';

export function createNodeArtifactVerifier(rootDir = process.cwd()): ArtifactVerifier {
  return (artifactPath: string): ArtifactVerification => {
    const resolvedPath = path.isAbsolute(artifactPath)
      ? artifactPath
      : path.resolve(rootDir, artifactPath);

    try {
      const stats = statSync(resolvedPath);
      return {
        checked: true,
        exists: stats.isFile(),
        size: stats.size,
        resolvedPath,
      };
    } catch (error) {
      return {
        checked: true,
        exists: false,
        resolvedPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
