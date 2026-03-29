'use client';

import { useEffect } from 'react';

function hideIndicatorInPortal(portal: Element) {
  const host = portal as HTMLElement;
  const root = host.shadowRoot;
  if (!root) return;

  const indicator = root.getElementById('data-devtools-indicator');
  if (indicator) {
    (indicator as HTMLElement).style.display = 'none';
  }
}

export function DisableNextDevIndicator() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    fetch('/__nextjs_disable_dev_indicator', {
      method: 'POST',
    }).catch(() => undefined);

    const hideAllIndicators = () => {
      const portals = document.querySelectorAll('nextjs-portal');
      portals.forEach((portal) => hideIndicatorInPortal(portal));
    };

    hideAllIndicators();

    const observer = new MutationObserver(() => hideAllIndicators());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const interval = window.setInterval(hideAllIndicators, 800);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

