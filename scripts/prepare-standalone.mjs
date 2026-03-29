import { access, cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const root = process.cwd();
  const standaloneRoot = path.join(root, '.next', 'standalone');
  const staticSrc = path.join(root, '.next', 'static');
  const staticDst = path.join(standaloneRoot, '.next', 'static');
  const publicSrc = path.join(root, 'public');
  const publicDst = path.join(standaloneRoot, 'public');

  if (!(await exists(standaloneRoot))) {
    throw new Error('Standalone output missing. Ensure `next build` completed successfully.');
  }

  await mkdir(path.dirname(staticDst), { recursive: true });

  if (await exists(staticSrc)) {
    await mkdir(staticDst, { recursive: true });
    const staticEntries = await readdir(staticSrc, { withFileTypes: true });
    for (const entry of staticEntries) {
      await cp(
        path.join(staticSrc, entry.name),
        path.join(staticDst, entry.name),
        { recursive: true, force: true }
      );
    }
  }

  if (await exists(publicSrc)) {
    await mkdir(publicDst, { recursive: true });
    const publicEntries = await readdir(publicSrc, { withFileTypes: true });
    for (const entry of publicEntries) {
      await cp(
        path.join(publicSrc, entry.name),
        path.join(publicDst, entry.name),
        { recursive: true, force: true }
      );
    }
  }

  process.stdout.write('Standalone assets prepared.\n');
}

main().catch((error) => {
  process.stderr.write(`prepare-standalone failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
