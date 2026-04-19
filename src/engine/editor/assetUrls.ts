export function buildAssetFileUrl(
  assetPath: string | null | undefined,
  options?: { preview?: boolean }
) {
  const raw = (assetPath ?? '').trim();
  if (!raw) {
    return '';
  }

  if (
    raw.startsWith('data:') ||
    raw.startsWith('blob:') ||
    raw.startsWith('http://') ||
    raw.startsWith('https://')
  ) {
    return raw;
  }

  const relative = raw.replace(/^\/+/, '');
  const query = new URLSearchParams({
    path: relative,
  });
  if (options?.preview) {
    query.set('preview', '1');
  }
  return `/api/assets/file?${query.toString()}`;
}
