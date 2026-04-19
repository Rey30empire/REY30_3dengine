import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_OUTPUT_BYTES = 200_000;

export interface AdminTerminalActionDescriptor {
  id: string;
  label: string;
  description: string;
  commandPreview: string;
  acceptsPath: boolean;
}

export interface AdminTerminalActionResult {
  actionId: string;
  label: string;
  commandPreview: string;
  cwd: string;
  stdout: string;
  stderr: string;
  code: number;
}

interface CommandActionDefinition extends AdminTerminalActionDescriptor {
  kind: 'command';
  command: string;
  args: string[];
  timeoutMs: number;
}

interface DirectoryActionDefinition extends AdminTerminalActionDescriptor {
  kind: 'directory';
}

type AdminTerminalActionDefinition = CommandActionDefinition | DirectoryActionDefinition;

const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const GIT_BIN = process.platform === 'win32' ? 'git.exe' : 'git';

const ACTIONS: AdminTerminalActionDefinition[] = [
  {
    id: 'project.list_directory',
    label: 'List files',
    description: 'Lista archivos y carpetas inmediatas dentro del proyecto.',
    commandPreview: 'List project directory',
    acceptsPath: true,
    kind: 'directory',
  },
  {
    id: 'project.git_status',
    label: 'Git status',
    description: 'Muestra cambios locales con git status --short.',
    commandPreview: 'git status --short',
    acceptsPath: false,
    kind: 'command',
    command: GIT_BIN,
    args: ['status', '--short'],
    timeoutMs: 20_000,
  },
  {
    id: 'project.typecheck',
    label: 'Typecheck',
    description: 'Ejecuta el typecheck seguro del proyecto.',
    commandPreview: 'pnpm run typecheck',
    acceptsPath: false,
    kind: 'command',
    command: PNPM_BIN,
    args: ['run', 'typecheck'],
    timeoutMs: 300_000,
  },
  {
    id: 'project.lint',
    label: 'Lint',
    description: 'Ejecuta eslint sobre el proyecto.',
    commandPreview: 'pnpm run lint',
    acceptsPath: false,
    kind: 'command',
    command: PNPM_BIN,
    args: ['run', 'lint'],
    timeoutMs: 300_000,
  },
  {
    id: 'project.test_unit',
    label: 'Test unit',
    description: 'Ejecuta el suite unitario completo.',
    commandPreview: 'pnpm run test:unit',
    acceptsPath: false,
    kind: 'command',
    command: PNPM_BIN,
    args: ['run', 'test:unit'],
    timeoutMs: 300_000,
  },
  {
    id: 'project.test_integration',
    label: 'Test integration',
    description: 'Ejecuta el suite de integración completo.',
    commandPreview: 'pnpm run test:integration',
    acceptsPath: false,
    kind: 'command',
    command: PNPM_BIN,
    args: ['run', 'test:integration'],
    timeoutMs: 300_000,
  },
  {
    id: 'project.build',
    label: 'Build web',
    description: 'Construye el app web con el pipeline seguro.',
    commandPreview: 'pnpm run build',
    acceptsPath: false,
    kind: 'command',
    command: PNPM_BIN,
    args: ['run', 'build'],
    timeoutMs: 900_000,
  },
];

export function getAdminTerminalActionCatalog(): AdminTerminalActionDescriptor[] {
  return ACTIONS.map(({ id, label, description, commandPreview, acceptsPath }) => ({
    id,
    label,
    description,
    commandPreview,
    acceptsPath,
  }));
}

export function getAdminTerminalActionById(
  actionId: string
): AdminTerminalActionDefinition | null {
  return ACTIONS.find((action) => action.id === actionId) ?? null;
}

function normalizeOutput(value: string, truncated: boolean): string {
  if (!truncated) return value;
  return `${value}\n\n[output truncated after ${MAX_OUTPUT_BYTES} bytes]`;
}

function resolveProjectPath(root: string, relativePath?: string): string {
  const requested = (relativePath || '.').trim() || '.';
  const resolved = path.resolve(root, requested);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('relativePath must stay inside project root');
  }
  return resolved;
}

async function executeDirectoryAction(
  action: DirectoryActionDefinition,
  root: string,
  relativePath?: string
): Promise<AdminTerminalActionResult> {
  const cwd = resolveProjectPath(root, relativePath);
  const entries = await readdir(cwd, { withFileTypes: true });
  const stdout = entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`)
    .join('\n');

  return {
    actionId: action.id,
    label: action.label,
    commandPreview: action.commandPreview,
    cwd,
    stdout,
    stderr: '',
    code: 0,
  };
}

async function executeCommandAction(
  action: CommandActionDefinition,
  root: string
): Promise<AdminTerminalActionResult> {
  return await new Promise<AdminTerminalActionResult>((resolve, reject) => {
    const child = spawn(action.command, action.args, {
      cwd: root,
      env: process.env,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    const appendChunk = (
      current: string,
      chunk: Buffer,
      truncated: boolean
    ): { value: string; truncated: boolean } => {
      if (truncated) {
        return { value: current, truncated };
      }
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') <= MAX_OUTPUT_BYTES) {
        return { value: next, truncated };
      }
      const clipped = Buffer.from(next, 'utf8')
        .subarray(0, MAX_OUTPUT_BYTES)
        .toString('utf8');
      return { value: clipped, truncated: true };
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, action.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      const next = appendChunk(stdout, chunk, stdoutTruncated);
      stdout = next.value;
      stdoutTruncated = next.truncated;
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const next = appendChunk(stderr, chunk, stderrTruncated);
      stderr = next.value;
      stderrTruncated = next.truncated;
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        actionId: action.id,
        label: action.label,
        commandPreview: action.commandPreview,
        cwd: root,
        stdout: normalizeOutput(stdout, stdoutTruncated),
        stderr: timedOut
          ? normalizeOutput(`${stderr}\nCommand timed out after ${action.timeoutMs}ms.`, stderrTruncated)
          : normalizeOutput(stderr, stderrTruncated),
        code: timedOut ? 124 : code ?? 1,
      });
    });
  });
}

export async function executeAdminTerminalAction(params: {
  actionId: string;
  root?: string;
  relativePath?: string;
}): Promise<AdminTerminalActionResult> {
  const root = params.root || process.cwd();
  const action = getAdminTerminalActionById(params.actionId);
  if (!action) {
    throw new Error('Unknown terminal action');
  }

  if (action.kind === 'directory') {
    return await executeDirectoryAction(action, root, params.relativePath);
  }

  return await executeCommandAction(action, root);
}
