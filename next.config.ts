import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        // Main site must not be framed by third parties.
        source: '/:locale(it|en)',
        headers: [...securityHeaders, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/:locale(it|en)/privacy',
        headers: [...securityHeaders, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        // The map worker is a module script: serve it with long-lived caching.
        source: '/vendor/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Embeds are meant to be framed anywhere ("Sharing is caring").
        source: '/:locale(it|en)/embed/:path*',
        headers: [...securityHeaders, { key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
    ];
  },
};

export default nextConfig;
