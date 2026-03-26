import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getConfig } from '../../config/app.config.js';
import { query } from '../../infrastructure/database/client.js';
import { getLogger } from '../../infrastructure/logging/logger.js';

const logger = getLogger();

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      username?: string;
      role: 'admin' | 'user';
      type: 'admin' | 'api_key';
      apiKeyId?: string;
      tenantId?: string | null;
    };
  }
}

/**
 * Middleware: Authenticate request with JWT token or API key
 * Supports both admin (JWT) and user (API key) authentication
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const config = getConfig();

    // Try JWT token first (admin auth)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        const decoded = jwt.verify(token, config.auth.jwtSecret) as any;

        request.user = {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role || 'admin',
          type: 'admin',
        };

        logger.debug({ userId: decoded.userId }, 'Authenticated via JWT');
        return; // Success - continue to route handler
      } catch (err) {
        // JWT invalid - try API key next
        logger.debug({ err }, 'JWT verification failed, trying API key');
      }
    }

    // Try API key (user auth)
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey && apiKey.startsWith('pl_')) {
      const prefix = apiKey.substring(0, 10);

      const result = await query(
        `SELECT id, name, user_name, key_hash, scopes, is_active, expires_at, tenant_id
         FROM api_keys
         WHERE key_prefix = $1 AND deleted_at IS NULL`,
        [prefix]
      );

      if (result.rows.length > 0) {
        const keyRecord = result.rows[0];

        // Check active
        if (!keyRecord.is_active) {
          reply.status(401).send({
            success: false,
            error: 'API key has been deactivated',
          });
          return;
        }

        // Check expiration
        if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
          reply.status(401).send({
            success: false,
            error: 'API key has expired',
          });
          return;
        }

        // Verify hash
        const isValid = await bcrypt.compare(apiKey, keyRecord.key_hash);

        if (isValid) {
          request.user = {
            userId: keyRecord.id,
            username: keyRecord.user_name || keyRecord.name,
            role: 'user',
            type: 'api_key',
            apiKeyId: keyRecord.id,
            tenantId: keyRecord.tenant_id,
          };

          // Update last used (async, don't wait)
          query(
            `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
            [keyRecord.id]
          ).catch((err) => {
            logger.warn({ err, keyId: keyRecord.id }, 'Failed to update API key last_used_at');
          });

          logger.debug({ keyId: keyRecord.id }, 'Authenticated via API key');
          return; // Success - continue to route handler
        }
      }
    }

    // No valid authentication found
    reply.status(401).send({
      success: false,
      error: 'Unauthorized: No valid authentication provided',
    });
  } catch (err) {
    logger.error({ err }, 'Authentication middleware error');
    reply.status(401).send({
      success: false,
      error: 'Unauthorized: Invalid authentication',
    });
  }
}

/**
 * Middleware: Require admin role
 * Use this AFTER authMiddleware
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    reply.status(401).send({
      success: false,
      error: 'Unauthorized: Authentication required',
    });
    return;
  }

  if (request.user.role !== 'admin') {
    reply.status(403).send({
      success: false,
      error: 'Forbidden: Admin access required',
    });
    return;
  }
}

/**
 * Middleware: Optional authentication
 * Does not block request if no auth provided, but injects user if present
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const config = getConfig();

    // Try JWT token
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, config.auth.jwtSecret) as any;
        request.user = {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role || 'admin',
          type: 'admin',
        };
        return;
      } catch (err) {
        // Ignore JWT errors in optional auth
      }
    }

    // Try API key
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey && apiKey.startsWith('pl_')) {
      const prefix = apiKey.substring(0, 10);
      const result = await query(
        `SELECT id, name, user_name, key_hash, is_active, expires_at, tenant_id
         FROM api_keys
         WHERE key_prefix = $1 AND deleted_at IS NULL AND is_active = true`,
        [prefix]
      );

      if (result.rows.length > 0) {
        const keyRecord = result.rows[0];
        if (!keyRecord.expires_at || new Date(keyRecord.expires_at) > new Date()) {
          const isValid = await bcrypt.compare(apiKey, keyRecord.key_hash);
          if (isValid) {
            request.user = {
              userId: keyRecord.id,
              username: keyRecord.user_name || keyRecord.name,
              role: 'user',
              type: 'api_key',
              apiKeyId: keyRecord.id,
              tenantId: keyRecord.tenant_id,
            };
          }
        }
      }
    }

    // If no auth found, just continue without user
  } catch (err) {
    logger.warn({ err }, 'Optional auth middleware error');
    // Don't block request on error in optional auth
  }
}
