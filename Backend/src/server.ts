import app from './server/app.js';
import { env } from './server/config/env.js';
import { connectDB, disconnectDB } from './server/db/mongo.js';

async function bootstrap(): Promise<void> {
  try {
    await connectDB();
    const server = app.listen(env.PORT, () => {
      console.log(`[RailNexus Backend] Server running on port http://localhost:${env.PORT} in ${env.NODE_ENV} mode`);
      console.log(`[RailNexus Backend] Brain service configured at: ${env.BRAIN_SERVICE_URL}`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n[RailNexus Backend] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log('[RailNexus Backend] HTTP server closed.');
        await disconnectDB();
        process.exit(0);
      });

      // Force shutdown after 10s if graceful fails
      setTimeout(() => {
        console.error('[RailNexus Backend] Force shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    console.error('[RailNexus Backend] Fatal startup error:', error);
    process.exit(1);
  }
}

void bootstrap();
