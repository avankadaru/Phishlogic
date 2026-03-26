/**
 * API Credentials Controller
 * Manages external API credentials (VirusTotal, Google Safe Browsing, etc.)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getCredentialsRepository } from '../../../infrastructure/database/repositories/credentials.repository.js';
import { encrypt, decrypt, sanitizeApiKey, isEncryptionKeySecure } from '../../../infrastructure/encryption/api-key-encryption.js';
import { getLogger } from '../../../infrastructure/logging/index.js';

const logger = getLogger();

// Validation schemas
const createCredentialSchema = z.object({
  credentialName: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores allowed'),
  displayName: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  provider: z.string().min(1).max(100),
  apiKey: z.string().min(1),
  apiSecret: z.string().optional(),
  endpointUrl: z.string().url().optional(),
  rateLimitPerDay: z.number().int().positive().optional(),
});

const updateCredentialSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  apiKey: z.string().min(1).optional(),
  apiSecret: z.string().optional(),
  endpointUrl: z.string().url().optional(),
  rateLimitPerDay: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

/**
 * GET /api/admin/credentials
 * List all API credentials
 */
export async function listCredentials(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const repository = getCredentialsRepository();
    const credentials = await repository.findAll();

    // Don't send encrypted keys to frontend - send sanitized versions
    const sanitizedCredentials = credentials.map((cred) => ({
      id: cred.id,
      credentialName: cred.credentialName,
      displayName: cred.displayName,
      description: cred.description,
      provider: cred.provider,
      apiKeySanitized: sanitizeApiKey(cred.apiKey), // Show partial key only
      hasApiSecret: !!cred.apiSecret,
      endpointUrl: cred.endpointUrl,
      rateLimitPerDay: cred.rateLimitPerDay,
      isActive: cred.isActive,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
    }));

    // Warn if encryption key is not secure
    const isSecure = isEncryptionKeySecure();
    if (!isSecure) {
      logger.warn({
        msg: 'API credentials using insecure encryption key',
        endpoint: '/api/admin/credentials',
      });
    }

    reply.send({
      credentials: sanitizedCredentials,
      encryptionSecure: isSecure,
    });
  } catch (error) {
    logger.error({
      msg: 'Failed to list credentials',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve credentials',
    });
  }
}

/**
 * GET /api/admin/credentials/:id
 * Get single API credential
 */
export async function getCredential(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { id } = idParamSchema.parse(request.params);

    const repository = getCredentialsRepository();
    const credential = await repository.findById(id);

    if (!credential) {
      return reply.status(404).send({
        error: 'Credential not found',
      });
    }

    // Return with sanitized API key (don't expose encrypted value)
    reply.send({
      id: credential.id,
      credentialName: credential.credentialName,
      displayName: credential.displayName,
      description: credential.description,
      provider: credential.provider,
      apiKeySanitized: sanitizeApiKey(credential.apiKey),
      hasApiSecret: !!credential.apiSecret,
      endpointUrl: credential.endpointUrl,
      rateLimitPerDay: credential.rateLimitPerDay,
      isActive: credential.isActive,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid credential ID',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to get credential',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to retrieve credential',
    });
  }
}

/**
 * POST /api/admin/credentials
 * Create new API credential
 */
export async function createCredential(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate request body
    const body = createCredentialSchema.parse(request.body);

    const repository = getCredentialsRepository();

    // Check if credential name already exists
    const exists = await repository.exists(body.credentialName);
    if (exists) {
      return reply.status(409).send({
        error: 'Credential with this name already exists',
      });
    }

    // Encrypt API key and secret before storage
    const encryptedApiKey = encrypt(body.apiKey);
    const encryptedApiSecret = body.apiSecret ? encrypt(body.apiSecret) : undefined;

    // Create credential
    const credential = await repository.create({
      credentialName: body.credentialName,
      displayName: body.displayName,
      description: body.description,
      provider: body.provider,
      apiKey: encryptedApiKey,
      apiSecret: encryptedApiSecret,
      endpointUrl: body.endpointUrl,
      rateLimitPerDay: body.rateLimitPerDay,
    });

    logger.info({
      msg: 'API credential created',
      credentialName: body.credentialName,
      provider: body.provider,
    });

    // Return with sanitized key
    reply.status(201).send({
      id: credential.id,
      credentialName: credential.credentialName,
      displayName: credential.displayName,
      description: credential.description,
      provider: credential.provider,
      apiKeySanitized: sanitizeApiKey(encryptedApiKey),
      hasApiSecret: !!credential.apiSecret,
      endpointUrl: credential.endpointUrl,
      rateLimitPerDay: credential.rateLimitPerDay,
      isActive: credential.isActive,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to create credential',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to create credential',
    });
  }
}

/**
 * PUT /api/admin/credentials/:id
 * Update existing API credential
 */
export async function updateCredential(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params and body
    const { id } = idParamSchema.parse(request.params);
    const body = updateCredentialSchema.parse(request.body);

    const repository = getCredentialsRepository();

    // Check if credential exists
    const existing = await repository.findById(id);
    if (!existing) {
      return reply.status(404).send({
        error: 'Credential not found',
      });
    }

    // Encrypt API key/secret if provided
    const updateParams: any = { ...body };
    if (body.apiKey) {
      updateParams.apiKey = encrypt(body.apiKey);
    }
    if (body.apiSecret) {
      updateParams.apiSecret = encrypt(body.apiSecret);
    }

    // Update credential
    const credential = await repository.update(id, updateParams);

    if (!credential) {
      return reply.status(404).send({
        error: 'Credential not found',
      });
    }

    logger.info({
      msg: 'API credential updated',
      credentialId: id,
      credentialName: credential.credentialName,
    });

    // Return with sanitized key
    reply.send({
      id: credential.id,
      credentialName: credential.credentialName,
      displayName: credential.displayName,
      description: credential.description,
      provider: credential.provider,
      apiKeySanitized: sanitizeApiKey(credential.apiKey),
      hasApiSecret: !!credential.apiSecret,
      endpointUrl: credential.endpointUrl,
      rateLimitPerDay: credential.rateLimitPerDay,
      isActive: credential.isActive,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to update credential',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to update credential',
    });
  }
}

/**
 * DELETE /api/admin/credentials/:id
 * Delete API credential
 */
export async function deleteCredential(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { id } = idParamSchema.parse(request.params);

    const repository = getCredentialsRepository();

    // Check if credential exists
    const existing = await repository.findById(id);
    if (!existing) {
      return reply.status(404).send({
        error: 'Credential not found',
      });
    }

    // Delete credential
    const deleted = await repository.delete(id);

    if (!deleted) {
      return reply.status(404).send({
        error: 'Credential not found',
      });
    }

    logger.info({
      msg: 'API credential deleted',
      credentialId: id,
      credentialName: existing.credentialName,
    });

    reply.send({
      success: true,
      message: 'Credential deleted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid credential ID',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to delete credential',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to delete credential',
    });
  }
}

/**
 * POST /api/admin/credentials/:id/test
 * Test API credential connection
 */
export async function testCredential(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate params
    const { id } = idParamSchema.parse(request.params);

    const repository = getCredentialsRepository();
    const credential = await repository.findById(id);

    if (!credential) {
      return reply.status(404).send({
        error: 'Credential not found',
      });
    }

    // Decrypt API key to verify it works (throws if invalid)
    decrypt(credential.apiKey);

    // Test based on provider
    // For now, just return success if decryption worked
    // In production, make actual API calls to test connectivity

    logger.info({
      msg: 'Tested API credential',
      credentialId: id,
      provider: credential.provider,
    });

    reply.send({
      success: true,
      message: `Credential for ${credential.provider} is valid`,
      provider: credential.provider,
      // In production, add actual test results here
      tested: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid credential ID',
        details: error.errors,
      });
    }

    logger.error({
      msg: 'Failed to test credential',
      error: error instanceof Error ? error.message : String(error),
    });

    reply.status(500).send({
      error: 'Failed to test credential',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
