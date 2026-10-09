// PM2 process config used by the GitHub Actions deploy (see .github/workflows/deploy.yml).
module.exports = {
  apps: [
    {
      name: 'vcg-backend',
      script: 'server.js',
      cwd: __dirname,
      instances: 1, // socket.io rooms are in-memory, so keep a single instance
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
