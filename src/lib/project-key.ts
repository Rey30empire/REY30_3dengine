export function sanitizeProjectKeySegment(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_');
}

export function normalizeProjectKey(value: string | null | undefined) {
  const sanitized = sanitizeProjectKeySegment(value || 'untitled_project').toLowerCase();
  return sanitized.length > 0 ? sanitized : 'untitled_project';
}
