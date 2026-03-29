import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './playwright-runtime.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (key?.startsWith('--') && value) {
    args.set(key.slice(2), value);
    i += 1;
  }
}

const baseUrl = args.get('base-url') || 'http://127.0.0.1:3000';
const outputDir = args.get('output-dir') || 'output/ai-flow-smoke';
const headless = (args.get('headless') || 'true') !== 'false';

fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1560, height: 820 } });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (err) => {
  consoleErrors.push(String(err));
});

async function clickMode(modeRegex) {
  const buttons = page.locator('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const handle = buttons.nth(i);
    const text = ((await handle.textContent()) || '').trim().toLowerCase();
    if (modeRegex.test(text)) {
      await handle.click({ force: true });
      await page.waitForTimeout(350);
      return true;
    }
  }
  return false;
}

async function sendPrompt(prompt) {
  const input = page.locator('input[placeholder*="Prompt"], input[placeholder*="Describe"], input[placeholder*="Modo manual"]').first();
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.fill(prompt);
  await input.press('Enter');
}

function buildReportBase() {
  return {
    ok: false,
    aiModeSwitchOk: false,
    hybridModeSwitchOk: false,
    platformWolfJumpDetected: false,
    chatWheelScrollOk: false,
    consoleViewportFound: false,
    consoleWheelScrollOk: false,
    consoleErrors: [],
  };
}

const report = buildReportBase();

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        (button.textContent || '').toLowerCase().includes('manual')
      ),
    { timeout: 20000 }
  );
  await page.waitForTimeout(400);

  report.aiModeSwitchOk = await clickMode(/^(ai|ia)/i);
  if (report.aiModeSwitchOk) {
    await page.waitForSelector('text=Asistente IA', { timeout: 12000 });
  }

  await sendPrompt('crea un juego de plataformas con enemigo lobo y salto');
  await page.waitForTimeout(4000);

  const chatRaw = await page.evaluate(() =>
    Array.from(document.querySelectorAll('div.text-sm.whitespace-pre-wrap'))
      .map((node) => node.textContent || '')
      .join('\n')
  );
  const chatLower = chatRaw.toLowerCase();
  report.platformWolfJumpDetected =
    chatLower.includes('plataforma') &&
    (chatLower.includes('lobo') || chatLower.includes('wolf')) &&
    (chatLower.includes('salto') || chatLower.includes('jump'));

  for (let i = 0; i < 14; i += 1) {
    await sendPrompt(`crea cubo smoke ${i + 1}`);
    await page.waitForTimeout(450);
  }

  const chatViewportBox = await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input')).find((item) => {
      const placeholder = (item.getAttribute('placeholder') || '').toLowerCase();
      return placeholder.includes('prompt') || placeholder.includes('describe');
    });
    const panel = input?.closest('div.flex.flex-col.h-full');
    const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  if (chatViewportBox) {
    const centerX = chatViewportBox.x + chatViewportBox.width / 2;
    const centerY = chatViewportBox.y + chatViewportBox.height / 2;

    const before = await page.evaluate(() => {
      const input = Array.from(document.querySelectorAll('input')).find((item) => {
        const placeholder = (item.getAttribute('placeholder') || '').toLowerCase();
        return placeholder.includes('prompt') || placeholder.includes('describe');
      });
      const panel = input?.closest('div.flex.flex-col.h-full');
      const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
      return viewport ? { top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight } : null;
    });

    await page.mouse.move(centerX, centerY);
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(220);
    const mid = await page.evaluate(() => {
      const input = Array.from(document.querySelectorAll('input')).find((item) => {
        const placeholder = (item.getAttribute('placeholder') || '').toLowerCase();
        return placeholder.includes('prompt') || placeholder.includes('describe');
      });
      const panel = input?.closest('div.flex.flex-col.h-full');
      const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
      return viewport ? { top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight } : null;
    });

    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(220);

    const after = await page.evaluate(() => {
      const input = Array.from(document.querySelectorAll('input')).find((item) => {
        const placeholder = (item.getAttribute('placeholder') || '').toLowerCase();
        return placeholder.includes('prompt') || placeholder.includes('describe');
      });
      const panel = input?.closest('div.flex.flex-col.h-full');
      const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
      return viewport ? { top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight } : null;
    });

    report.chatWheelScrollOk = Boolean(
      before &&
      mid &&
      after &&
      typeof before.top === 'number' &&
      typeof mid.top === 'number' &&
      typeof after.top === 'number' &&
      before.max > 0 &&
      mid.max > 0 &&
      after.max > 0 &&
      (before.top !== mid.top || mid.top !== after.top)
    );
  }

  await page.screenshot({ path: path.join(outputDir, 'ai-first-after-pipeline.png'), fullPage: true });

  report.hybridModeSwitchOk = await clickMode(/^(hibrido|híbrido|hybrid)/i);
  await page.waitForTimeout(350);

  const hybridTabCandidates = page.locator('button:visible', { hasText: /^(Hybrid|Híbrido)$/i });
  const hybridTabCount = await hybridTabCandidates.count();
  if (hybridTabCount > 0) {
    await hybridTabCandidates.nth(hybridTabCount - 1).click({ force: true });
    await page.waitForTimeout(250);
  }

  for (let round = 0; round < 10; round += 1) {
    for (const label of ['Terreno', 'Player', 'Enemigo', 'Arma']) {
      const target = page.locator('button', { hasText: label }).first();
      if (await target.count()) {
        await target.click({ force: true });
        await page.waitForTimeout(90);
      }
    }
  }

  const consoleTabCandidates = page.locator('button:visible', { hasText: /^Console$/i });
  const consoleTabCount = await consoleTabCandidates.count();
  if (consoleTabCount > 0) {
    await consoleTabCandidates.nth(consoleTabCount - 1).click({ force: true });
    await page.waitForTimeout(350);
  }

  const consoleViewportBox = await page.evaluate(() => {
    const search = Array.from(document.querySelectorAll('input')).find((item) =>
      (item.getAttribute('placeholder') || '').toLowerCase().includes('search logs')
    );
    const panel = search?.closest('div.flex.flex-col.h-full');
    const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
    if (!viewport) return null;
    const rect = viewport.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  if (consoleViewportBox) {
    report.consoleViewportFound = true;
    const before = await page.evaluate(() => {
      const search = Array.from(document.querySelectorAll('input')).find((item) =>
        (item.getAttribute('placeholder') || '').toLowerCase().includes('search logs')
      );
      const panel = search?.closest('div.flex.flex-col.h-full');
      const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
      return viewport ? { top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight } : null;
    });

    const centerX = consoleViewportBox.x + consoleViewportBox.width / 2;
    const centerY = consoleViewportBox.y + consoleViewportBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(220);
    const mid = await page.evaluate(() => {
      const search = Array.from(document.querySelectorAll('input')).find((item) =>
        (item.getAttribute('placeholder') || '').toLowerCase().includes('search logs')
      );
      const panel = search?.closest('div.flex.flex-col.h-full');
      const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
      return viewport ? { top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight } : null;
    });

    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(220);

    const after = await page.evaluate(() => {
      const search = Array.from(document.querySelectorAll('input')).find((item) =>
        (item.getAttribute('placeholder') || '').toLowerCase().includes('search logs')
      );
      const panel = search?.closest('div.flex.flex-col.h-full');
      const viewport = panel?.querySelector('[data-slot="scroll-area-viewport"]');
      return viewport ? { top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight } : null;
    });

    const hasOverflow = Boolean(
      before &&
      mid &&
      after &&
      typeof before.max === 'number' &&
      typeof mid.max === 'number' &&
      typeof after.max === 'number' &&
      (before.max > 0 || mid.max > 0 || after.max > 0)
    );

    report.consoleWheelScrollOk = hasOverflow
      ? Boolean(
          before &&
          mid &&
          after &&
          typeof before.top === 'number' &&
          typeof mid.top === 'number' &&
          typeof after.top === 'number' &&
          (before.top !== mid.top || mid.top !== after.top)
        )
      : true;

    fs.writeFileSync(
      path.join(outputDir, 'console-scroll-probe.json'),
      JSON.stringify({ before, mid, after, hasOverflow }, null, 2)
    );
  } else {
    report.consoleViewportFound = false;
    report.consoleWheelScrollOk = true;
  }

  await page.screenshot({ path: path.join(outputDir, 'hybrid-console-after-logs.png'), fullPage: true });

  report.consoleErrors = [...consoleErrors];
  report.ok = Boolean(
    report.aiModeSwitchOk &&
    report.hybridModeSwitchOk &&
    report.platformWolfJumpDetected &&
    report.chatWheelScrollOk &&
    report.consoleWheelScrollOk
  );
} finally {
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  await page.close();
  await browser.close();
}

if (!report.ok) {
  process.stderr.write(`ai-flow-smoke failed: ${JSON.stringify(report, null, 2)}\n`);
  process.exit(1);
}
