/**
 * Logging infrastructure using Pino
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';
import { getConfig } from '../../config/index.js';
import type { LogEntry } from '../../core/models/analysis-result.js';

/**
 * Step context for log capture
 */
interface StepContext {
  stepId: string;
  onLogCapture: (entry: LogEntry) => void;
}

/**
 * AsyncLocalStorage for thread-safe step context
 */
const stepContextStorage = new AsyncLocalStorage<StepContext>();

/**
 * Set step context for log capture
 *
 * @param stepId - Step ID to capture logs for
 * @param onLogCapture - Callback to capture log entries
 */
export function setStepContext(stepId: string, onLogCapture: (entry: LogEntry) => void): void {
  stepContextStorage.enterWith({ stepId, onLogCapture });
}

/**
 * Clear step context (handled automatically by AsyncLocalStorage)
 * This is a no-op but provided for explicit context clearing
 */
export function clearStepContext(): void {
  // AsyncLocalStorage automatically clears context when async operation completes
  // This function exists for explicit clearing if needed
}

/**
 * Get current step context
 *
 * @returns Current step context or undefined
 */
export function getCurrentStepContext(): StepContext | undefined {
  return stepContextStorage.getStore();
}

/**
 * Create logger instance with log capture support
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
    hooks: {
      logMethod(this: any, args: any[], method: pino.LogFn, level: number) {
        // Capture log for current step context
        const context = stepContextStorage.getStore();
        if (context?.onLogCapture) {
          const [logObj, msg, ..._rest] = args;

          // Determine log level name
          const levelLabel = this.levels.labels[level] as 'debug' | 'info' | 'warn' | 'error';

          // Extract message and metadata
          let message = '';
          let metadata: Record<string, unknown> = {};

          if (typeof logObj === 'string') {
            // Simple string log: logger.info('message')
            message = logObj;
          } else if (typeof logObj === 'object' && logObj !== null) {
            // Object log: logger.info({ key: value }, 'message')
            message = typeof msg === 'string' ? msg : logObj.msg || '';
            metadata = { ...logObj };
            delete metadata['msg']; // Remove msg from metadata to avoid duplication
          }

          // Capture the log entry
          context.onLogCapture({
            timestamp: new Date(),
            level: levelLabel,
            message,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          });
        }

        // Continue with normal logging
        method.apply(this, args as Parameters<typeof method>);
      },
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
