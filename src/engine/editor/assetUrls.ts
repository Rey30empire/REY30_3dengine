export function buildAssetFileUrl(assetPath: string | null | undefined) {
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
  return `/api/assets/file?path=${encodeURIComponent(relative)}`;
}
