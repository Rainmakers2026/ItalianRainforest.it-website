'use client';

import type { ReactNode } from 'react';

/** Opens the explorer filtered on `query` (e.g. `category=vc`) without reloading the page. */
export function openExplorer(query: string) {
  const href = `?${query}#map`;
  window.history.pushState(window.history.state, '', `${window.location.pathname}${href}`);
  // The explorer listens to popstate (filters) and hashchange (load + map view).
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  document.getElementById('map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Link that opens the Rainforest explorer with a preset filter (e.g.
 * `category=vc` or `region=lombardia`) without reloading the page. The plain
 * href keeps it working without JavaScript and when opened in a new tab.
 */
export function ExploreLink({
  query,
  className,
  children,
  tabIndex,
}: {
  query: string;
  className?: string;
  children: ReactNode;
  tabIndex?: number;
}) {
  return (
    <a
      href={`?${query}#map`}
      className={className}
      tabIndex={tabIndex}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openExplorer(query);
      }}
    >
      {children}
    </a>
  );
}
