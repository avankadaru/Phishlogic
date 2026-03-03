/**
 * Application configuration schema and loader
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Server configuration schema
 */
const ServerConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  corsOrigins: z
    .string()
    .transform((val) => val.split(','))
    .default('http://localhost:3000'),
});

/**
 * Logging configuration schema
 */
const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  prettyPrint: z.coerce.boolean().default(true),
});

/**
 * Analysis configuration schema
 */
const AnalysisConfigSchema = z.object({
  timeouts: z.object({
    static: z.coerce.number().int().min(1000).max(60000).default(10000),
    dynamic: z.coerce.number().int().min(1000).max(60000).default(25000),
    total: z.coerce.number().int().min(1000).max(120000).default(30000),
  }),
  thresholds: z.object({
    malicious: z.coerce.number().min(0).max(1).default(0.7),
    suspicious: z.coerce.number().min(0).max(1).default(0.4),
  }),
  weights: z.record(z.string(), z.number()).default({
    spf: 1.5,
    dkim: 1.5,
    urlEntropy: 1.0,
    header: 1.0,
    redirect: 1.3,
    form: 1.8,
    domainReputation: 1.2,
  }),
});

/**
 * Browser configuration schema
 */
const BrowserConfigSchema = z.object({
  poolSize: z.coerce.number().int().min(1).max(10).default(3),
  maxPages: z.coerce.number().int().min(1).max(20).default(5),
  timeout: z.coerce.number().int().min(5000).max(60000).default(20000),
});

/**
 * Cache configuration schema
 */
const CacheConfigSchema = z.object({
  ttl: z.coerce.number().int().min(60).max(86400).default(3600),
  maxSize: z.coerce.number().int().min(100).max(10000).default(1000),
});

/**
 * Security configuration schema
 */
const SecurityConfigSchema = z.object({
  rateLimit: z.object({
    max: z.coerce.number().int().min(1).max(1000).default(100),
    window: z.coerce.number().int().min(1000).max(3600000).default(60000),
  }),
});

/**
 * Email/SMTP configuration schema
 */
const EmailConfigSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  smtp: z.object({
    host: z.string().default('smtp.gmail.com'),
    port: z.coerce.number().int().min(1).max(65535).default(587),
    secure: z.coerce.boolean().default(false),
    user: z.string().optional(),
    password: z.string().optional(),
  }),
  from: z.string().email().default('phishlogic@example.com'),
  alertRecipients: z
    .string()
    .transform((val) => val.split(',').map((email) => email.trim()))
    .default(''),
  alertThreshold: z.coerce.number().min(0).max(10).default(7),
  batchMode: z.coerce.boolean().default(false),
  batchInterval: z.coerce.number().int().min(60000).max(86400000).default(3600000), // 1 hour
});

/**
 * Complete application configuration schema
 */
const AppConfigSchema = z.object({
  server: ServerConfigSchema,
  logging: LoggingConfigSchema,
  analysis: AnalysisConfigSchema,
  browser: BrowserConfigSchema,
  cache: CacheConfigSchema,
  security: SecurityConfigSchema,
  email: EmailConfigSchema,
});

/**
 * Application configuration type
 */
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AppConfig {
  const rawConfig = {
    server: {
      nodeEnv: process.env['NODE_ENV'],
      port: process.env['PORT'],
      host: process.env['HOST'],
      corsOrigins: process.env['CORS_ORIGINS'],
    },
    logging: {
      level: process.env['LOG_LEVEL'],
      prettyPrint: process.env['LOG_PRETTY_PRINT'],
    },
    analysis: {
      timeouts: {
        static: process.env['STATIC_ANALYSIS_TIMEOUT'],
        dynamic: process.env['DYNAMIC_ANALYSIS_TIMEOUT'],
        total: process.env['ANALYSIS_TIMEOUT'],
      },
      thresholds: {
        malicious: process.env['MALICIOUS_THRESHOLD'],
        suspicious: process.env['SUSPICIOUS_THRESHOLD'],
      },
      weights: {}, // Use defaults
    },
    browser: {
      poolSize: process.env['BROWSER_POOL_SIZE'],
      maxPages: process.env['BROWSER_MAX_PAGES'],
      timeout: process.env['BROWSER_TIMEOUT'],
    },
    cache: {
      ttl: process.env['CACHE_TTL'],
      maxSize: process.env['CACHE_MAX_SIZE'],
    },
    security: {
      rateLimit: {
        max: process.env['RATE_LIMIT_MAX'],
        window: process.env['RATE_LIMIT_WINDOW'],
      },
    },
    email: {
      enabled: process.env['EMAIL_ENABLED'],
      smtp: {
        host: process.env['SMTP_HOST'],
        port: process.env['SMTP_PORT'],
        secure: process.env['SMTP_SECURE'],
        user: process.env['SMTP_USER'],
        password: process.env['SMTP_PASSWORD'],
      },
      from: process.env['EMAIL_FROM'],
      alertRecipients: process.env['EMAIL_ALERT_RECIPIENTS'],
      alertThreshold: process.env['EMAIL_ALERT_THRESHOLD'],
      batchMode: process.env['EMAIL_BATCH_MODE'],
      batchInterval: process.env['EMAIL_BATCH_INTERVAL'],
    },
  };

  try {
    return AppConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      console.error(JSON.stringify(error.errors, null, 2));
      throw new Error('Invalid configuration');
    }
    throw error;
  }
}

/**
 * Get configuration with singleton pattern
 */
let configInstance: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}
