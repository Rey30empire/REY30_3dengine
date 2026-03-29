import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function tryRequire(moduleId) {
  try {
    return require(moduleId);
  } catch {
    return null;
  }
}

function resolveCodexFallback() {
  const homeDir = os.homedir();
  if (!homeDir) return null;
  return path.join(homeDir, '.codex', 'skills', 'develop-web-game', 'node_modules', 'playwright');
}

export function loadPlaywright() {
  const fromLocalPlaywright = tryRequire('playwright');
  if (fromLocalPlaywright?.chromium) {
    return fromLocalPlaywright;
  }

  const fromPlaywrightTest = tryRequire('@playwright/test');
  if (fromPlaywrightTest?.chromium) {
    return fromPlaywrightTest;
  }

  const codexFallback = resolveCodexFallback();
  if (codexFallback) {
    const fromCodexFallback = tryRequire(codexFallback);
    if (fromCodexFallback?.chromium) {
      return fromCodexFallback;
    }
  }

  throw new Error(
    'Playwright runtime not found. Install the local dependency with "pnpm install" and browsers with "pnpm exec playwright install chromium".'
  );
}

export const { chromium } = loadPlaywright();
