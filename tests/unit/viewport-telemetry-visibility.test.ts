import { describe, expect, it } from 'vitest';
import { isViewportTelemetryDocumentVisible } from '@/engine/editor/viewport/useViewportTelemetry';

describe('viewport telemetry visibility policy', () => {
  it('allows ingest when the document is visible', () => {
    expect(isViewportTelemetryDocumentVisible('visible', false)).toBe(true);
  });

  it('blocks hidden background tabs during normal interactive use', () => {
    expect(isViewportTelemetryDocumentVisible('hidden', false)).toBe(false);
  });

  it('allows hidden automated runtimes so release smokes can emit telemetry', () => {
    expect(isViewportTelemetryDocumentVisible('hidden', true)).toBe(true);
  });
});
