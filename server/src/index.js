// Server entry point. The Express app is wrapped in a plain http.Server so
// Socket.IO (the chat gateway) can share the same port and session cookie.
import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { initChat } from './chat/socket.js';
import { initPermissions } from './lib/permissions.js';
import { startNotificationScheduler } from './lib/notificationScheduler.js';

// Safety net: Express routes are wrapped in asyncHandler (middleware/error.js)
// so a rejected promise there always resolves to a clean HTTP error response.
// But not everything runs inside an Express request — Socket.IO's
// `io.on('connection', async (socket) => {...})` (chat/socket.js) is the
// clearest example: nothing awaits or catches that listener's promise, so an
// uncaught rejection there is a genuinely UNHANDLED one. Node's default
// behavior since v15 is to crash the whole process on any unhandled
// rejection — meaning one transient DB hiccup on a single user's socket
// reconnect could take the entire server down for everyone (this is exactly
// what was happening: fixed at the source in chat/socket.js, but this net
// stays as defense-in-depth against the same mistake anywhere else).
process.on('unhandledRejection', (reason) => {
  console.error('[fintness-crm] Unhandled promise rejection (not crashing):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fintness-crm] Uncaught exception (not crashing):', err);
});

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
