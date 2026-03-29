export type UILanguage = 'auto' | 'spanish' | 'english';
export type UILanguageScope = 'all' | 'buttons_actions' | 'names_only' | 'labels_only';

export type UILanguageConfig = {
  language: UILanguage;
  scope: UILanguageScope;
  translateButtons: boolean;
  translateActions: boolean;
  translateNames: boolean;
  translateTechnicalTerms: boolean;
  updatedAt: string;
};

const STORAGE_KEY = 'rey30.ui_language_config.v1';
const EVENT_NAME = 'rey30:ui-language-config';

const DEFAULT_CONFIG: UILanguageConfig = {
  language: 'spanish',
  scope: 'all',
  translateButtons: true,
  translateActions: true,
  translateNames: true,
  translateTechnicalTerms: false,
  updatedAt: new Date().toISOString(),
};

export function getDefaultUILanguageConfig(): UILanguageConfig {
  return { ...DEFAULT_CONFIG };
}

export function getUILanguageConfig(): UILanguageConfig {
  if (typeof window === 'undefined') {
    return getDefaultUILanguageConfig();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultUILanguageConfig();
    const parsed = JSON.parse(raw) as Partial<UILanguageConfig>;
    return sanitizeUILanguageConfig(parsed);
  } catch {
    return getDefaultUILanguageConfig();
  }
}

export function saveUILanguageConfig(config: UILanguageConfig): UILanguageConfig {
  const normalized = sanitizeUILanguageConfig(config);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: normalized }));
  }
  return normalized;
}

export function subscribeUILanguageConfig(listener: (config: UILanguageConfig) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<UILanguageConfig>).detail;
    listener(sanitizeUILanguageConfig(detail));
  };
  window.addEventListener(EVENT_NAME, onEvent);
  return () => window.removeEventListener(EVENT_NAME, onEvent);
}

function sanitizeUILanguageConfig(raw: Partial<UILanguageConfig> | null | undefined): UILanguageConfig {
  const config = raw || {};
  const language: UILanguage =
    config.language === 'auto' || config.language === 'spanish' || config.language === 'english'
      ? config.language
      : DEFAULT_CONFIG.language;
  const scope: UILanguageScope =
    config.scope === 'all' ||
    config.scope === 'buttons_actions' ||
    config.scope === 'names_only' ||
    config.scope === 'labels_only'
      ? config.scope
      : DEFAULT_CONFIG.scope;

  return {
    language,
    scope,
    translateButtons: config.translateButtons ?? DEFAULT_CONFIG.translateButtons,
    translateActions: config.translateActions ?? DEFAULT_CONFIG.translateActions,
    translateNames: config.translateNames ?? DEFAULT_CONFIG.translateNames,
    translateTechnicalTerms: config.translateTechnicalTerms ?? DEFAULT_CONFIG.translateTechnicalTerms,
    updatedAt: config.updatedAt || new Date().toISOString(),
  };
}

