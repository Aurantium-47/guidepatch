import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';

try {
  const config = loadConfig();
  if (config.databasePath === ':memory:') throw new Error('server_requires_persistent_database');
  const app = createApp({ config });
  app.server.listen(config.port, config.host, () => {
    console.log(`GuidePatch listening on ${config.host}:${app.server.address().port}; see /api/status for current availability`);
  });
  const shutdown = () => { app.close().then(() => process.exit(0)).catch(() => process.exit(1)); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`GuidePatch configuration failed: ${error.message}`);
  process.exitCode = 1;
}
