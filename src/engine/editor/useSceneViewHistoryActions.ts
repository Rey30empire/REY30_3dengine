'use client';

import { useCallback } from 'react';
import { useEngineStore } from '@/store/editorStore';

export function useSceneViewHistoryActions(params: {
  undoPaint: () => boolean;
  redoPaint: () => boolean;
  getLastPastPaintTimestamp: () => number;
  getLastFuturePaintTimestamp: () => number;
}) {
  const { undoPaint, redoPaint, getLastPastPaintTimestamp, getLastFuturePaintTimestamp } = params;

  const handleUndo = useCallback(() => {
    const store = useEngineStore.getState();
    const lastStore = store.historyPast[store.historyPast.length - 1];
    const paintTs = getLastPastPaintTimestamp();
    const storeTs = lastStore?.timestamp ?? -Infinity;

    if (paintTs > storeTs) {
      if (!undoPaint()) {
        store.undo();
      }
      return;
    }

    store.undo();
  }, [getLastPastPaintTimestamp, undoPaint]);

  const handleRedo = useCallback(() => {
    const store = useEngineStore.getState();
    const nextStore = store.historyFuture[0];
    const paintTs = getLastFuturePaintTimestamp();
    const storeTs = nextStore?.timestamp ?? -Infinity;

    if (paintTs > storeTs) {
      if (!redoPaint()) {
        store.redo();
      }
      return;
    }

    store.redo();
  }, [getLastFuturePaintTimestamp, redoPaint]);

  return {
    handleUndo,
    handleRedo,
  };
}
