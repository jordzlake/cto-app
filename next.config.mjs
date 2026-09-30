/** @type {import('next').NextConfig} */
const nextConfig = {
  // nodemailer and pdf-lib use Node APIs; load them at runtime instead of bundling them.
  serverExternalPackages: ['nodemailer', 'pdf-lib'],
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Links carry a secret token; never leak it to other sites.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
