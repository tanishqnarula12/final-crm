// Express application assembly: security middleware, CORS, routes, error
// handling. Kept separate from index.js so it can be imported by tests later.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import clientRoutes from './routes/clients.js';
import goalRoutes from './routes/goals.js';
import momRoutes from './routes/moms.js';
import leadRoutes from './routes/leads.js';
import taskRoutes from './routes/tasks.js';
import queryRoutes from './routes/queries.js';
import leaveRoutes from './routes/leave.js';
import meetingRoutes from './routes/meetings.js';
import prospectRoutes from './routes/prospects.js';
import profileRoutes from './routes/profile.js';
import chatRoutes from './routes/chat.js';
import teamRoutes from './routes/team.js';
import activityLogRoutes from './routes/activityLog.js';
import permissionRoutes from './routes/permissions.js';
import notificationRoutes from './routes/notifications.js';
import pushRoutes from './routes/push.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind a proxy (rate limiting)

  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '15mb' })); // large limit: proposals/docs carry base64 blobs
  app.use(cookieParser());

  // Health check (no auth) — used by uptime checks and the verification steps.
  app.get('/health', (req, res) => res.json({ status: 'ok', env: config.env, time: new Date().toISOString() }));

  // Throttle auth attempts to blunt brute-force / credential stuffing.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/goals', goalRoutes);
  app.use('/api/moms', momRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/queries', queryRoutes);
  app.use('/api/leave', leaveRoutes);
  app.use('/api/meetings', meetingRoutes);
  app.use('/api/prospects', prospectRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/activity-log', activityLogRoutes);
  app.use('/api/permissions', permissionRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/push', pushRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
