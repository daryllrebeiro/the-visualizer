/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.BUILD_STANDALONE === 'true' ? { output: 'standalone' } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const configuredHosts = [
      process.env.NEXT_PUBLIC_API_URL,
      process.env.NEXT_PUBLIC_WS_URL,
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : []),
    ]
      .filter(Boolean)
      .join(' ');

    const connectSrc = isProd
      ? `connect-src 'self' ${configuredHosts};`.replace(/\s+/g, ' ')
      : `connect-src 'self' ${configuredHosts} http://localhost:* ws://localhost:* https://localhost:* wss://localhost:*;`.replace(/\s+/g, ' ');
    const scriptSrc = isProd
      ? "script-src 'self' 'unsafe-inline';"
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline';";

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value:
              `default-src 'self'; frame-ancestors 'none'; ${scriptSrc} style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; ${connectSrc}`,
          },

          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
