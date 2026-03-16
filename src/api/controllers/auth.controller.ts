import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../../infrastructure/database/client.js';
import { getLogger } from '../../infrastructure/logging/logger.js';
import { getConfig } from '../../config/app.config.js';

const logger = getLogger();

// Validation schemas
const AdminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const UserLoginSchema = z.object({
  apiKey: z.string().startsWith('pl_'),
});

const CreateApiKeySchema = z.object({
  name: z.string().min(1),
  userName: z.string().optional(),
  userEmail: z.string().email().optional(),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().positive().optional(),
});

/**
 * POST /api/auth/login/admin - Admin login with username/password
 */
export async function loginAdmin(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { username, password } = AdminLoginSchema.parse(request.body);
    const config = getConfig();

    // Find admin user
    const result = await query(
      `SELECT id, username, password_hash, email, role, is_active
       FROM admin_users
       WHERE username = $1 AND deleted_at IS NULL`,
      [username]
    );

    if (result.rows.length === 0) {
      reply.status(401).send({
        success: false,
        error: 'Invalid username or password',
      });
      return;
    }

    const adminUser = result.rows[0];

    // Check if active
    if (!adminUser.is_active) {
      reply.status(401).send({
        success: false,
        error: 'Account is deactivated',
      });
      return;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, adminUser.password_hash);

    if (!isValid) {
      reply.status(401).send({
        success: false,
        error: 'Invalid username or password',
      });
      return;
    }

    // Generate JWT token
    const payload = {
      userId: adminUser.id,
      username: adminUser.username,
      role: 'admin',
      type: 'admin',
    };
    const secret = config.auth.jwtSecret;
    const token = jwt.sign(payload, secret, {
      expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });

    // Update last login
    await query(
      `UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [adminUser.id]
    );

    // Log successful login
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, status, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['admin', adminUser.id, adminUser.username, 'auth.login', 'admin_user', 'success', request.ip]
    );

    logger.info({ userId: adminUser.id, username: adminUser.username }, 'Admin logged in');

    reply.send({
      success: true,
      token,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        email: adminUser.email,
        role: 'admin',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Admin login failed');
    reply.status(500).send({
      success: false,
      error: 'Internal server error',
    });
  }
}

/**
 * POST /api/auth/login/user - User login with API key
 */
export async function loginUser(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { apiKey } = UserLoginSchema.parse(request.body);

    if (!apiKey || !apiKey.startsWith('pl_')) {
      reply.status(400).send({
        success: false,
        error: 'Invalid API key format',
      });
      return;
    }

    // Extract prefix (first 10 chars)
    const prefix = apiKey.substring(0, 10);

    // Find key by prefix
    const result = await query(
      `SELECT id, name, user_name, user_email, key_hash, scopes, is_active, expires_at
       FROM api_keys
       WHERE key_prefix = $1 AND deleted_at IS NULL`,
      [prefix]
    );

    if (result.rows.length === 0) {
      reply.status(401).send({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }

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

    if (!isValid) {
      reply.status(401).send({
        success: false,
        error: 'Invalid API key',
      });
      return;
    }

    // Update last used
    await query(
      `UPDATE api_keys SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [keyRecord.id]
    );

    // Log successful login
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, status, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['api_key', keyRecord.id, keyRecord.user_name || keyRecord.name, 'auth.login', 'api_key', 'success', request.ip]
    );

    logger.info({ keyId: keyRecord.id, userName: keyRecord.user_name }, 'User logged in with API key');

    reply.send({
      success: true,
      apiKey: apiKey, // Return for localStorage storage
      user: {
        id: keyRecord.id,
        name: keyRecord.user_name || keyRecord.name,
        email: keyRecord.user_email,
        role: 'user',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'User login failed');
    reply.status(500).send({
      success: false,
      error: 'Internal server error',
    });
  }
}

/**
 * POST /api/admin/keys - Create new API key (ADMIN ONLY)
 */
export async function createApiKey(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check if requester is admin (from middleware)
    if (request.user?.role !== 'admin') {
      reply.status(403).send({
        success: false,
        error: 'Forbidden: Admin access required',
      });
      return;
    }

    const { name, userName, userEmail, scopes, expiresInDays } = CreateApiKeySchema.parse(request.body);

    // Generate API key
    const randomKey = generateApiKey();
    const keyHash = await bcrypt.hash(randomKey, 10);
    const keyPrefix = randomKey.substring(0, 10);

    // Calculate expiration
    let expiresAt = null;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Insert into database
    const result = await query(
      `INSERT INTO api_keys
       (name, user_name, user_email, key_hash, key_prefix, is_admin, scopes, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, user_name, user_email, key_prefix, expires_at, created_at`,
      [
        name,
        userName || null,
        userEmail || null,
        keyHash,
        keyPrefix,
        false, // Regular users, not admin
        scopes || ['read', 'write'], // Use provided scopes or default
        expiresAt,
        request.user.username || 'admin',
      ]
    );

    // Log API key creation
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'admin',
        request.user.userId,
        request.user.username,
        'api_key.create',
        'api_key',
        result.rows[0].id,
        'success',
        `Created API key: ${name}`,
      ]
    );

    logger.info(
      { keyId: result.rows[0].id, keyName: name, createdBy: request.user.username },
      'API key created by admin'
    );

    const keyInfo = result.rows[0];
    reply.send({
      success: true,
      message: 'API key created successfully',
      apiKey: randomKey, // Show once - never again!
      keyPrefix: keyInfo.key_prefix,
      keyInfo: {
        id: keyInfo.id,
        name: keyInfo.name,
        userName: keyInfo.user_name,
        userEmail: keyInfo.user_email,
        keyPrefix: keyInfo.key_prefix,
        expiresAt: keyInfo.expires_at,
        createdAt: keyInfo.created_at,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: err.errors,
      });
      return;
    }

    logger.error({ err }, 'Failed to create API key');
    reply.status(500).send({
      success: false,
      error: 'Failed to create API key',
    });
  }
}

/**
 * GET /api/admin/keys - List all API keys (ADMIN ONLY)
 */
export async function listApiKeys(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check if requester is admin
    if (request.user?.role !== 'admin') {
      reply.status(403).send({
        success: false,
        error: 'Forbidden: Admin access required',
      });
      return;
    }

    const result = await query(
      `SELECT id, name, user_name, user_email, key_prefix, scopes, is_active,
              expires_at, last_used_at, created_by, created_at
       FROM api_keys
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    // Transform snake_case to camelCase for frontend
    const keys = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      userName: row.user_name,
      userEmail: row.user_email,
      keyPrefix: row.key_prefix,
      scopes: row.scopes,
      isActive: row.is_active,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));

    reply.send({
      success: true,
      data: keys,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to list API keys');
    reply.status(500).send({
      success: false,
      error: 'Failed to list API keys',
    });
  }
}

/**
 * DELETE /api/admin/keys/:id - Revoke API key (ADMIN ONLY)
 */
export async function revokeApiKey(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check if requester is admin
    if (request.user?.role !== 'admin') {
      reply.status(403).send({
        success: false,
        error: 'Forbidden: Admin access required',
      });
      return;
    }

    const { id } = request.params;

    // Get key info before revoking
    const keyResult = await query(
      `SELECT user_name FROM api_keys WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (keyResult.rows.length === 0) {
      reply.status(404).send({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    // Soft delete (mark as deleted)
    await query(
      `UPDATE api_keys
       SET deleted_at = NOW(), is_active = false, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Log API key revocation
    await query(
      `INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, resource_type, resource_id, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'admin',
        request.user.userId,
        request.user.username,
        'api_key.revoke',
        'api_key',
        id,
        'success',
        `Revoked API key for ${keyResult.rows[0].user_name}`,
      ]
    );

    logger.info({ keyId: id, revokedBy: request.user.username }, 'API key revoked');

    reply.send({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to revoke API key');
    reply.status(500).send({
      success: false,
      error: 'Failed to revoke API key',
    });
  }
}

/**
 * Generate secure random API key
 * Format: pl_{40 hex chars}
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(20).toString('hex'); // 40 chars
  return `pl_${randomBytes}`;
}

/**
 * POST /api/auth/verify - Verify current token/API key
 */
export async function verifyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    if (!request.user) {
      reply.status(401).send({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    reply.send({
      success: true,
      user: request.user,
    });
  } catch (err) {
    logger.error({ err }, 'Auth verification failed');
    reply.status(500).send({
      success: false,
      error: 'Internal server error',
    });
  }
}
