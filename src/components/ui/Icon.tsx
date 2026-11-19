import type { SVGProps } from 'react';

const PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35',
  filter: 'M4 6h16M7 12h10M10 18h4',
  x: 'M6 6l12 12M18 6 6 18',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  arrowLeft: 'M19 12H5m6 6-6-6 6-6',
  external: 'M14 4h6v6m0-6L10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'm5 12 5 5 9-10',
  mail: 'M4 6h16v12H4zm0 0 8 7 8-7',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  chevronDown: 'm6 9 6 6 6-6',
  chevronUp: 'm6 15 6-6 6 6',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  menu: 'M4 7h16M4 12h16M4 17h16',
  reset: 'M4 12a8 8 0 1 0 2.34-5.66M4 4v4h4',
  sort: 'M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3',
  sortAsc: 'M12 19V5m0 0-5 5m5-5 5 5',
  sortDesc: 'M12 5v14m0 0-5-5m5 5 5-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  target: 'M12 3v3m0 12v3M3 12h3m12 0h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  code: 'm8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14',
  chat: 'M4 5h16v11H8l-4 4V5Z',
  phone: 'M5 4h3.5l1.8 4.6-2.3 1.6a11.5 11.5 0 0 0 5.8 5.8l1.6-2.3 4.6 1.8V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5h.01M11 11h1v6h1',
  users:
    'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M6 11h12v9H6z',
  network: 'M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 5v6m0 0-6 6m6-6 6 6',
  rocket:
    'M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2m6-11a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-4.5 10.5-3-3C8 9 12 3 21 3c0 9-6 13-9.5 14.5ZM9 13l-4-1 3-4h4m0 8 1 4 4-3v-4',
  building: 'M4 21V5l8-3v19M12 9h8v12M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01M2 21h20',
  coins: 'M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm6.9-4.6A6 6 0 1 1 10.6 18M8 6h1.5v4',
  landmark: 'M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M2 10l10-6 10 6',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  share:
    'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  // Paper plane (Telegram-style), drawn as an outline like the other icons.
  telegram: 'M21 4 3 11l6 2.5M21 4l-3.5 16-8.5-6.5M21 4 9 13.5V19l3-3.5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  handshake: 'm11 17 2 2a1.4 1.4 0 0 0 2-2m-2-2 2.5 2.5a1.4 1.4 0 0 0 2-2L14 12l-2.5 1.5a1.8 1.8 0 0 1-2.4-2.6L12.5 8 9 5 3 9v5l4 4m14-9-6-4-2.5 3M21 9v5l-2.5 2',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
