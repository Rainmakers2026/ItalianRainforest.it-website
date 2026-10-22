'use client';

import type { AnchorHTMLAttributes } from 'react';
import { track, type AnalyticsEvent } from '@/lib/analytics';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  event: AnalyticsEvent;
  props?: Record<string, string | number | boolean | undefined>;
};

/** External link that opens in a new tab, records an analytics event and keeps UTM-free referrer policy. */
export function OutboundLink({ href, event, props, children, ...rest }: Props) {
  return (
    <a href={href} target="_blank" rel="noopener" onClick={() => track(event, props)} onAuxClick={() => track(event, props)} {...rest}>
      {children}
    </a>
  );
}
