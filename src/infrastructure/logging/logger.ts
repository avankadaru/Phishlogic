/**
 * Logging infrastructure using Pino
 */

import pino from 'pino';
import { getConfig } from '../../config/index.js';

/**
 * Create logger instance
 */
export function createLogger(): pino.Logger {
  const config = getConfig();

  const logger = pino({
    level: config.logging.level,
    transport: config.logging.prettyPrint
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    base: {
      app: 'phishlogic',
    },
  });

  return logger;
}

/**
 * Singleton logger instance
 */
let loggerInstance: pino.Logger | null = null;

/**
 * Get or create logger instance
 */
export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>): pino.Logger {
  return getLogger().child(context);
}

/**
 * Reset logger (useful for testing)
 */
export function resetLogger(): void {
  loggerInstance = null;
}
