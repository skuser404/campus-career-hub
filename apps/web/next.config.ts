import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // @cch/shared ships as TypeScript-compiled CommonJS from the monorepo rather
  // than as a published package, so Next must run it through its own pipeline.
  transpilePackages: ['@cch/shared'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Job images are admin-supplied URLs that may point anywhere. Next's
      // optimiser refuses unlisted hosts, so an unrecognised host renders via a
      // plain <img> fallback rather than a broken card.
      { protocol: 'https', hostname: '**' },
    ],
  },

  /**
   * Proxy the API through this app, so every request the browser makes is
   * SAME-ORIGIN.
   *
   * This is the fix for the split-hosting cookie problem. The web app is on
   * Vercel and the API is on Render — two different domains. A cookie the API
   * sets is a THIRD-PARTY cookie to the Vercel page: the Next.js middleware
   * cannot read it (so it bounces you back to login), and Safari/Firefox block
   * it outright (so you can never stay signed in).
   *
   * With this rewrite the browser talks only to `<this-site>/api/v1/*`, and
   * Next forwards it to the real API server-side. The auth cookie then comes
   * back through THIS origin, so the browser stores it as first-party — visible
   * to the middleware and accepted by every browser.
   *
   * The target defaults to the production API and can be overridden with
   * API_PROXY_TARGET (a server-only var — no NEXT_PUBLIC_ prefix, so it is never
   * shipped to the browser).
   */
  async rewrites() {
    const target =
      process.env.API_PROXY_TARGET ??
      (process.env.NODE_ENV === 'production'
        ? 'https://campus-career-hub-api.onrender.com'
        : 'http://localhost:4000');

    return [{ source: '/api/v1/:path*', destination: `${target}/api/v1/:path*` }];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
