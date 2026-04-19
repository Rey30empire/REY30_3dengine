export type AuditDateRange = {
  from: string;
  to: string;
  fromMs: number | null;
  toMs: number | null;
};

export type AuditDateRangeResult =
  | AuditDateRange
  | {
      error: string;
    };

function getFirstQueryValue(searchParams: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) {
      return value.trim();
    }
  }
  return '';
}

export function resolveDateRange(searchParams: URLSearchParams): AuditDateRangeResult {
  const from = getFirstQueryValue(searchParams, ['from', 'dateFrom']);
  const to = getFirstQueryValue(searchParams, ['to', 'dateTo']);
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;

  if (from && !Number.isFinite(fromMs)) {
    return { error: 'from debe ser una fecha válida.' };
  }
  if (to && !Number.isFinite(toMs)) {
    return { error: 'to debe ser una fecha válida.' };
  }
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    return { error: 'from debe ser menor o igual a to.' };
  }

  return { from, to, fromMs, toMs };
}
