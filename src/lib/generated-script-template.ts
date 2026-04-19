export function normalizeGeneratedScriptPath(scriptPath: string): {
  directory: string;
  name: string;
  relativePath: string;
} {
  const cleaned = scriptPath.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  const withoutScriptsPrefix = cleaned.toLowerCase().startsWith('scripts/')
    ? cleaned.slice('scripts/'.length)
    : cleaned;
  const safeRelative = withoutScriptsPrefix || 'AutoScript.generated.ts';
  const lastSlash = safeRelative.lastIndexOf('/');
  const directory = lastSlash >= 0 ? safeRelative.slice(0, lastSlash) : '';
  const rawName = lastSlash >= 0 ? safeRelative.slice(lastSlash + 1) : safeRelative;
  const name = /\.[a-z0-9]+$/i.test(rawName) ? rawName : `${rawName}.ts`;
  const relativePath = directory ? `${directory}/${name}` : name;
  return { directory, name, relativePath };
}

export function buildGeneratedScriptTemplate(relativePath: string, prompt: string): string {
  const baseName = relativePath
    .split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '')
    ?.replace(/[^A-Za-z0-9_]/g, '_') || 'GeneratedScript';

  return `// ${relativePath}
// Auto-generado por REY30 AI workflow
// Prompt: ${prompt}

export interface ${baseName}Context {
  deltaTime: number;
  entityId?: string;
}

export function update(_context: ${baseName}Context): void {
  // TODO: reemplaza este stub con logica real.
}
`;
}
