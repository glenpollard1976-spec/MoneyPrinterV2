/**
 * PM2 process manager configuration
 * Usage:
 *   npm run start:pm2     — start the process
 *   npm run stop:pm2      — stop it
 *   npm run logs:pm2      — tail logs
 *   pm2 save              — persist process list across reboots
 *   pm2 startup           — generate startup hook
 */

module.exports = {
  apps: [
    {
      name: 'crownworks-backend',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 'max',          // Use all CPU cores
      exec_mode: 'cluster',       // Cluster mode for load balancing
      watch: false,               // Disable in production
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Restart policy
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
    },
  ],
};
