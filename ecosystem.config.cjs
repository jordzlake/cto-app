// pm2 process file:  pm2 start ecosystem.config.cjs
// Runs `next start` on 127.0.0.1 only; nginx/Apache forwards /cto/ to it.
// Keep a single instance (fork mode): approvals are locked in-process and the mail retry loop must run once.
module.exports = {
  apps: [
    {
      name: 'cto-app',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3010 -H 127.0.0.1', // change 3010 if that port is taken on the server
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
