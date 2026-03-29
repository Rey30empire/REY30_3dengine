import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'output_Rey30');
const DB_PATH = path.join(OUTPUT_ROOT, 'assets-db.json');

function hashFile(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function makeAsset(filePath: string, type: string, nameOverride?: string) {
  const abs = path.resolve(filePath);
  const buffer = await fs.readFile(abs);
  const ext = path.extname(abs);
  const name = nameOverride || path.basename(abs, ext);
  return {
    id: uuidv4(),
    name,
    type,
    path: path.relative(process.cwd(), abs).replace(/\\/g, '/'),
    size: buffer.length,
    hash: hashFile(buffer),
    version: 1,
    createdAt: new Date().toISOString(),
  };
}

async function main() {
  const meshPath = path.join(OUTPUT_ROOT, 'assets', 'mesh', 'roblox_cube.json');
  const scenePath = path.join(OUTPUT_ROOT, 'scenes', 'pruba_lk.scene.json');
  const scriptPath = path.join(process.cwd(), 'scripts', 'RobloxWalker.ts');

  const assets = [
    await makeAsset(meshPath, 'mesh', 'roblox_cube'),
    await makeAsset(scenePath, 'scene', 'pruba_lk'),
    await makeAsset(scriptPath, 'script', 'RobloxWalker'),
  ];

  await fs.writeFile(DB_PATH, JSON.stringify({ assets }, null, 2), 'utf-8');
  console.log('assets-db.json written:', DB_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
