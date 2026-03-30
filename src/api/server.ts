/**
 * Fastify server setup
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '../config/index.js';
import { getLogger } from '../infrastructure/logging/index.js';
import { registerRoutes } from './routes/index.js';
import { initDatabase, closeDatabase } from '../infrastructure/database/client.js';

const logger = getLogger();

/**
 * Create and configure Fastify server
 */
export async function createServer(): Promise<ReturnType<typeof Fastify>> {
  const config = getConfig();

  // Create Fastify instance
  const server = Fastify({
    logger: {
      level: config.logging.level,
    },
    disableRequestLogging: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    requestTimeout: 60000, // 60 seconds - buffer above frontend timeout
  });

  // Register helmet for security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  // Register CORS
  await server.register(cors, {
    origin: config.server.corsOrigins,
    credentials: true,
  });

  // Register rate limiting
  await server.register(rateLimit, {
    max: config.security.rateLimit.max,
    timeWindow: config.security.rateLimit.window,
  });

  // Register error handler
  server.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    logger.error({
      msg: 'Request error',
      error: error.message,
      stack: error.stack,
      requestId: request.id,
      url: request.url,
      method: request.method,
    });

    const statusCode = error.statusCode ?? 500;

    return reply.status(statusCode).send({
      error: error.message,
      statusCode,
      requestId: request.id,
    });
  });

  // Register routes
  await registerRoutes(server);

  logger.info('Fastify server configured');

  return server;
}

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  const config = getConfig();

  // Initialize database connection
  try {
    initDatabase();
    logger.info('Database connection initialized');
  } catch (error) {
    logger.error({
      msg: 'Failed to initialize database',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  const server = await createServer();

  try {
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    logger.info({
      msg: 'Server started',
      host: config.server.host,
      port: config.server.port,
      env: config.server.nodeEnv,
    });

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down server...');
      await server.close();
      await closeDatabase();
      logger.info('Server shut down');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error({
      msg: 'Failed to start server',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}
