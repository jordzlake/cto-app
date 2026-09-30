/** @type {import('next').NextConfig} */
const nextConfig = {
  // nodemailer, pdf-lib and mysql2 use Node APIs; load them at runtime instead of bundling them.
  serverExternalPackages: ['nodemailer', 'pdf-lib', 'mysql2'],
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
