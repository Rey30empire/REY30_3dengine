import { access, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    i += 1;
  }
  return args;
}

function help() {
  return `Create the short Usage Guide tour video from committed screenshots.

Usage:
  node scripts/create-usage-guide-tour-video.mjs

Options:
  --output docs/assets/usage-guide-tour.mp4
  --seconds-per-shot 3
`;
}

function toPositiveNumber(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function assertFile(filePath) {
  await access(filePath);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has('help') || args.has('h')) {
    process.stdout.write(help());
    return;
  }

  const root = process.cwd();
  const firstShot = path.join(root, 'docs', 'assets', 'usage-guide-tour.png');
  const secondShot = path.join(root, 'docs', 'assets', 'usage-guide-demo-scene.png');
  const output = path.resolve(
    root,
    args.get('output') || 'docs/assets/usage-guide-tour.mp4'
  );
  const secondsPerShot = toPositiveNumber(args.get('seconds-per-shot'), 3);

  await assertFile(firstShot);
  await assertFile(secondShot);
  await mkdir(path.dirname(output), { recursive: true });

  const filter =
    '[0:v]scale=1280:720:force_original_aspect_ratio=decrease,' +
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x020617,setsar=1[v0];' +
    '[1:v]scale=1280:720:force_original_aspect_ratio=decrease,' +
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x020617,setsar=1[v1];' +
    '[v0][v1]concat=n=2:v=1:a=0,format=yuv420p[v]';

  await run('ffmpeg', [
    '-y',
    '-loop',
    '1',
    '-t',
    String(secondsPerShot),
    '-i',
    firstShot,
    '-loop',
    '1',
    '-t',
    String(secondsPerShot),
    '-i',
    secondShot,
    '-filter_complex',
    filter,
    '-map',
    '[v]',
    '-r',
    '30',
    '-movflags',
    '+faststart',
    output,
  ]);

  process.stdout.write(`Usage guide tour video written to ${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`create-usage-guide-tour-video failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
