import { Pool, QueryResult, QueryResultRow, PoolConfig } from 'pg';
import { getConfig } from '../../config/app.config.js';
import { getLogger } from '../logging/logger.js';

// Re-export types for use in repositories
export type { QueryResult, QueryResultRow };

const logger = getLogger();
let pool: Pool | null = null;

/**
 * Initialize PostgreSQL connection pool
 */
export function initDatabase(): Pool {
  // Close existing pool if it exists (for hot reload scenarios)
  if (pool) {
    pool.end().catch((err) => {
      logger.warn({ err }, 'Error closing existing database pool');
    });
    pool = null;
  }

  const config = getConfig();

  // Set PGSSLMODE environment variable to disable SSL if not configured
  // This ensures pg library respects the SSL setting
  if (!config.database.ssl) {
    process.env.PGSSLMODE = 'disable';
  } else {
    process.env.PGSSLMODE = 'prefer';
  }

  const poolConfig: PoolConfig = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    max: config.database.poolSize || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Explicitly disable SSL negotiation when SSL is not configured
    // This prevents pg from attempting SSL with servers that don't support it
    ssl: config.database.ssl ? {
      rejectUnauthorized: false, // For self-signed certificates in dev
    } : false,
  };

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected database error on idle client');
  });

  pool.on('connect', () => {
    logger.debug('Database client connected');
  });

  logger.info({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    poolSize: config.database.poolSize,
    ssl: poolConfig.ssl,
    sslMode: process.env.PGSSLMODE,
  }, 'Database connection pool initialized');

  return pool;
}

/**
 * Get database pool (initialize if needed)
 */
export function getDatabase(): Pool {
  if (!pool) {
    return initDatabase();
  }
  return pool;
}

/**
 * Execute a query with logging and error handling
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const db = getDatabase();

  try {
    const result = await db.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug({
      query: text,
      paramCount: params?.length || 0,
      rows: result.rowCount,
      duration,
    }, 'Database query executed');

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error({
      err,
      query: text,
      paramCount: params?.length || 0,
      duration,
    }, 'Database query failed');
    throw err;
  }
}

/**
 * Execute a transaction with automatic rollback on error
 */
export async function transaction<T>(
  callback: (client: Pool) => Promise<T>
): Promise<T> {
  const db = getDatabase();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client as any);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Transaction rolled back');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query<{ version: string }>('SELECT version() as version');
    logger.info({ version: result.rows[0]?.version }, 'Database connection test successful');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database connection test failed');
    return false;
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

/**
 * Get pool stats for monitoring
 */
export function getPoolStats(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} {
  if (!pool) {
    return { totalCount: 0, idleCount: 0, waitingCount: 0 };
  }

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}
