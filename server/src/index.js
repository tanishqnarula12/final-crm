// Server entry point. The Express app is wrapped in a plain http.Server so
// Socket.IO (the chat gateway) can share the same port and session cookie.
import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { initChat } from './chat/socket.js';
import { initPermissions } from './lib/permissions.js';
import { startNotificationScheduler } from './lib/notificationScheduler.js';

const app = createApp();
const server = http.createServer(app);

initChat(server);
startNotificationScheduler();

// Warm the permission-matrix cache before serving (falls back to catalog
// defaults if this fails, so the engine is never left without rules).
initPermissions()
  .then((n) => console.log(`[fintness-crm] Permission matrix loaded (${n} cells).`))
  .catch((err) => console.error('[fintness-crm] Failed to load permission matrix:', err));

server.listen(config.port, () => {
  console.log(`[fintness-crm] API + chat listening on http://localhost:${config.port} (${config.env})`);
  console.log(`[fintness-crm] Allowing frontend origin: ${config.clientOrigin}`);
});
