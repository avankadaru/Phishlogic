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
  // Enterprise-grade analyzer weights (configurable per analyzer)
  analyzerWeights: z.object({
    linkReputation: z.coerce.number().min(0.5).max(3.0).default(2.5),
    attachment: z.coerce.number().min(0.5).max(3.0).default(2.3),
    senderReputation: z.coerce.number().min(0.5).max(3.0).default(1.8),
    contentAnalysis: z.coerce.number().min(0.5).max(3.0).default(1.6),
    redirect: z.coerce.number().min(0.5).max(3.0).default(1.5),
    form: z.coerce.number().min(0.5).max(3.0).default(1.0),
    spf: z.coerce.number().min(0.5).max(3.0).default(1.4),
    dkim: z.coerce.number().min(0.5).max(3.0).default(1.4),
    urlEntropy: z.coerce.number().min(0.5).max(3.0).default(1.2),
  }),
  // Context-aware signal adjustments
  signalAdjustments: z.object({
    positiveSignalValue: z.coerce.number().min(0).max(0.5).default(0.2),
    contextPositiveReduction: z.coerce.number().min(0).max(1).default(0.7),
    contextThreatIntelBoost: z.coerce.number().min(0).max(0.5).default(0.2),
    contextCriticalBoost: z.coerce.number().min(0).max(0.5).default(0.3),
  }),
  // JavaScript security scan timeout (milliseconds)
  scriptScanTimeoutMs: z.coerce.number().int().min(1000).max(30000).default(10000),
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
 * Database configuration schema
 */
const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  name: z.string().default('phishlogic'),
  user: z.string().default('phishlogic'),
  password: z.string(),
  poolSize: z.coerce.number().int().min(1).max(100).default(20),
  ssl: z.coerce.boolean().default(false),
});

/**
 * Authentication configuration schema
 */
const AuthConfigSchema = z.object({
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('30d'),
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
 * Whitelist trust level configuration schema
 */
const WhitelistConfigSchema = z.object({
  defaultTrustLevel: z.enum(['high', 'medium', 'low']).default('high'),
  trustLevelEnabled: z.coerce.boolean().default(true),
  trustLevelLogging: z.coerce.boolean().default(true),
});

/**
 * Complete application configuration schema
 */
const AppConfigSchema = z.object({
  server: ServerConfigSchema,
  logging: LoggingConfigSchema,
  database: DatabaseConfigSchema,
  auth: AuthConfigSchema,
  analysis: AnalysisConfigSchema,
  browser: BrowserConfigSchema,
  cache: CacheConfigSchema,
  security: SecurityConfigSchema,
  email: EmailConfigSchema,
  whitelist: WhitelistConfigSchema,
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
    database: {
      host: process.env['DB_HOST'],
      port: process.env['DB_PORT'],
      name: process.env['DB_NAME'],
      user: process.env['DB_USER'],
      password: process.env['DB_PASSWORD'],
      poolSize: process.env['DB_POOL_SIZE'],
      // Properly parse boolean string ("false" string should be false boolean)
      ssl: process.env['DB_SSL'] === 'true',
    },
    auth: {
      jwtSecret: process.env['JWT_SECRET'],
      jwtExpiresIn: process.env['JWT_EXPIRES_IN'],
    },
    analysis: {
      timeouts: {
        static: process.env['STATIC_ANALYSIS_TIMEOUT'],
        dynamic: process.env['DYNAMIC_ANALYSIS_TIMEOUT'],
        total: process.env['ANALYSIS_TIMEOUT'],
      },
      thresholds: {
        malicious: process.env['VERDICT_THRESHOLD_MALICIOUS'],
        suspicious: process.env['VERDICT_THRESHOLD_SUSPICIOUS'],
      },
      analyzerWeights: {
        linkReputation: process.env['ANALYZER_WEIGHT_LINK_REPUTATION'],
        attachment: process.env['ANALYZER_WEIGHT_ATTACHMENT'],
        senderReputation: process.env['ANALYZER_WEIGHT_SENDER_REPUTATION'],
        contentAnalysis: process.env['ANALYZER_WEIGHT_CONTENT_ANALYSIS'],
        redirect: process.env['ANALYZER_WEIGHT_REDIRECT'],
        form: process.env['ANALYZER_WEIGHT_FORM'],
        spf: process.env['ANALYZER_WEIGHT_SPF'],
        dkim: process.env['ANALYZER_WEIGHT_DKIM'],
        urlEntropy: process.env['ANALYZER_WEIGHT_URL_ENTROPY'],
      },
      signalAdjustments: {
        positiveSignalValue: process.env['POSITIVE_SIGNAL_VALUE'],
        contextPositiveReduction: process.env['CONTEXT_POSITIVE_REDUCTION'],
        contextThreatIntelBoost: process.env['CONTEXT_THREAT_INTEL_BOOST'],
        contextCriticalBoost: process.env['CONTEXT_CRITICAL_BOOST'],
      },
      scriptScanTimeoutMs: process.env['SCRIPT_SCAN_TIMEOUT_MS'],
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
    whitelist: {
      defaultTrustLevel: process.env['WHITELIST_DEFAULT_TRUST_LEVEL'],
      trustLevelEnabled: process.env['WHITELIST_TRUST_LEVEL_ENABLED'],
      trustLevelLogging: process.env['WHITELIST_TRUST_LEVEL_LOGGING'],
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
