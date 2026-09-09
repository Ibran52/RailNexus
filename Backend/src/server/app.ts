/**
 * app.ts — RailNexus Backend
 * Express application configuration, middleware wiring, and route definitions.
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { sanitizeNoSql } from './middleware/validation';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

import authRoutes from './routes/authRoutes';
import maintenanceRoutes from './routes/maintenanceRoutes';
import controllerRoutes from './routes/controllerRoutes';
import brainRoutes from './routes/brainRoutes';
import auditRoutes from './routes/auditRoutes';
import { ErrorCode } from './config/constants';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  // 1. Security Headers
  app.use(helmet());

  // 2. Strict CORS Configuration from environment
  const allowedOrigins = [env.CORS_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000'].filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || env.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          callback(new Error(`CORS origin '${origin}' not allowed.`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    })
  );

  // 3. Body parsers with size limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 3b. Cookie parser (zero external dependency)
  app.use((req: Request, _res: Response, next) => {
    const raw = req.headers.cookie;
    const cookies: Record<string, string> = {};
    if (raw) {
      const pairs = raw.split(';');
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx > 0) {
          const key = pair.substring(0, idx).trim();
          const val = pair.substring(idx + 1).trim();
          try {
            cookies[key] = decodeURIComponent(val);
          } catch {
            cookies[key] = val;
          }
        }
      }
    }
    req.cookies = cookies;
    next();
  });

  // 4. NoSQL injection sanitizer
  app.use(sanitizeNoSql);

  // 5. Rate limiting
  app.use(apiLimiter);

  // 6. Health Check
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      service: 'railnexus-backend',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // 7. Route Mounts (/api/v1 prefix and root aliases)
  app.use('/api/v1/auth', authRoutes);
  app.use('/auth', authRoutes);
  app.use('/api/v1/maintenance', maintenanceRoutes);
  app.use('/api/v1/controller', controllerRoutes);
  app.use('/api/v1/brain', brainRoutes);
  app.use('/api/v1/audit', auditRoutes);

  // 8. 404 Route Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: ErrorCode.REQUEST_NOT_FOUND,
        message: `Route not found: ${req.method} ${req.originalUrl}`,
      },
    });
  });

  // 9. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
