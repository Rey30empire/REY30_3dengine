const ACCENT_REPLACEMENTS: Record<string, string> = {
  á: 'a',
  é: 'e',
  í: 'i',
  ó: 'o',
  ú: 'u',
  ü: 'u',
  ñ: 'n',
};

export class RequestNormalizer {
  normalize(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[áéíóúüñ]/g, (char) => ACCENT_REPLACEMENTS[char] ?? char)
      .replace(/\s+/g, ' ');
  }
}
