/**
 * Redis Cache Service
 * Provides caching for URL reputation checks
 * Falls back gracefully if Redis is not available
 */

import Redis from 'ioredis';
import { getLogger } from '../logging/index.js';

const logger = getLogger();

export class RedisCacheService {
  private client: Redis | null = null;
  private isAvailable = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Redis connection
   * Fails gracefully if Redis is not available
   */
  private initialize(): void {
    try {
      const redisHost = process.env['REDIS_HOST'] || 'localhost';
      const redisPort = parseInt(process.env['REDIS_PORT'] || '6379', 10);
      const redisPassword = process.env['REDIS_PASSWORD'];
      const redisTTL = parseInt(process.env['REDIS_TTL'] || '86400', 10); // 24 hours default

      this.client = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword || undefined,
        retryStrategy: (times) => {
          // Stop retrying after 3 attempts
          if (times > 3) {
            logger.warn('Redis connection failed after 3 attempts - operating without cache');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true, // Don't connect immediately
        maxRetriesPerRequest: 3,
      });

      // Handle connection events
      this.client.on('connect', () => {
        this.isAvailable = true;
        logger.info({
          msg: 'Redis cache connected',
          host: redisHost,
          port: redisPort,
          ttl: redisTTL,
        });
      });

      this.client.on('error', (error) => {
        this.isAvailable = false;
        logger.warn({
          msg: 'Redis cache error - continuing without cache',
          error: error.message,
        });
      });

      this.client.on('close', () => {
        this.isAvailable = false;
        logger.debug('Redis cache connection closed');
      });

      // Attempt to connect
      this.client.connect().catch((error) => {
        logger.warn({
          msg: 'Redis not available - operating without cache',
          error: error.message,
        });
        this.isAvailable = false;
      });
    } catch (error) {
      logger.warn({
        msg: 'Redis cache initialization failed - operating without cache',
        error: error instanceof Error ? error.message : String(error),
      });
      this.isAvailable = false;
    }
  }

  /**
   * Get value from cache
   * Returns null if not found or cache unavailable
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value) {
        return JSON.parse(value) as T;
      }
      return null;
    } catch (error) {
      logger.debug({
        msg: 'Redis get error',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   * Fails silently if cache unavailable
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable || !this.client) {
      return;
    }

    try {
      const ttl = ttlSeconds || parseInt(process.env['REDIS_TTL'] || '86400', 10);
      await this.client.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.debug({
        msg: 'Redis set error',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Delete value from cache
   * Fails silently if cache unavailable
   */
  async delete(key: string): Promise<void> {
    if (!this.isAvailable || !this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.debug({
        msg: 'Redis delete error',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if cache is available
   */
  isReady(): boolean {
    return this.isAvailable;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isAvailable = false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ isAvailable: boolean; info?: string }> {
    if (!this.isAvailable || !this.client) {
      return { isAvailable: false };
    }

    try {
      const info = await this.client.info('stats');
      return { isAvailable: true, info };
    } catch (error) {
      return { isAvailable: false };
    }
  }
}

// Singleton instance
let cacheInstance: RedisCacheService | null = null;

/**
 * Get Redis cache service instance
 */
export function getRedisCache(): RedisCacheService {
  if (!cacheInstance) {
    cacheInstance = new RedisCacheService();
  }
  return cacheInstance;
}
