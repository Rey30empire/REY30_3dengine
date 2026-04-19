'use client';

import { useEffect, useState } from 'react';
import {
  getEditorShortcutConfig,
  subscribeEditorShortcutConfig,
  type EditorShortcutConfig,
} from '@/lib/editor-shortcuts';

export function useEditorShortcutConfig() {
  const [shortcutConfig, setShortcutConfig] = useState<EditorShortcutConfig>(() =>
    getEditorShortcutConfig()
  );

  useEffect(() => {
    const unsubscribe = subscribeEditorShortcutConfig((config) => {
      setShortcutConfig(config);
    });
    return unsubscribe;
  }, []);

  return shortcutConfig;
}
