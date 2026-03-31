/**
 * SCIM Authentication Middleware
 * Validates Bearer token for SCIM API access
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getOrganizationRepository } from '../../infrastructure/database/repositories/organization.repository.js';
import { getLogger } from '../../infrastructure/logging/logger.js';
import { createScimError } from '../schemas/scim.schema.js';

const logger = getLogger();

// Extend FastifyRequest to include organization context
declare module 'fastify' {
  interface FastifyRequest {
    scimOrganization?: {
      id: string;
      domain: string;
      displayName: string;
    };
  }
}

/**
 * SCIM Bearer Token Authentication Middleware
 * Validates the Authorization header and looks up organization
 */
export async function scimAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    logger.warn({ url: request.url, msg: 'SCIM request without Authorization header' });
    return reply.status(401).send(
      createScimError(401, 'Authorization header required', 'invalidValue')
    );
  }

  // Parse Bearer token
  const match = authHeader.match(/^Bearer (.+)$/i);
  if (!match) {
    logger.warn({ url: request.url, msg: 'SCIM request with invalid Authorization format' });
    return reply.status(401).send(
      createScimError(401, 'Invalid Authorization header format. Expected: Bearer <token>', 'invalidValue')
    );
  }

  const bearerToken = match[1];

  if (!bearerToken) {
    logger.warn({ url: request.url, msg: 'SCIM request with empty bearer token' });
    return reply.status(401).send(
      createScimError(401, 'Bearer token is empty', 'invalidValue')
    );
  }

  // Look up organization by bearer token
  const orgRepo = getOrganizationRepository();

  try {
    // Query organizations with matching SCIM bearer token
    const orgs = await orgRepo.findMany({
      scim_bearer_token: bearerToken,
      scim_enabled: true,
      deleted_at: null,
    });

    if (orgs.length === 0) {
      logger.warn({
        tokenPrefix: bearerToken.substring(0, 10),
        msg: 'SCIM request with invalid bearer token',
      });
      return reply.status(401).send(
        createScimError(401, 'Invalid bearer token', 'invalidValue')
      );
    }

    const org = orgs[0];

    if (!org) {
      logger.warn({ msg: 'Organization not found after query' });
      return reply.status(401).send(
        createScimError(401, 'Invalid bearer token', 'invalidValue')
      );
    }

    // Attach organization to request context
    request.scimOrganization = {
      id: org.id,
      domain: org.domain,
      displayName: org.displayName,
    };

    logger.info({
      organizationId: org.id,
      domain: org.domain,
      method: request.method,
      url: request.url,
      msg: 'SCIM request authenticated',
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      msg: 'SCIM authentication error',
    });
    return reply.status(500).send(
      createScimError(500, 'Internal server error during authentication')
    );
  }
}

/**
 * Rate limiting for SCIM endpoints (per organization)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function scimRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    // Auth middleware should run first
    return;
  }

  const orgId = request.scimOrganization.id;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 100; // 100 requests per minute per org

  let rateLimit = rateLimitMap.get(orgId);

  if (!rateLimit || now > rateLimit.resetAt) {
    // Start new window
    rateLimit = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitMap.set(orgId, rateLimit);
    return;
  }

  rateLimit.count++;

  if (rateLimit.count > maxRequests) {
    logger.warn({
      organizationId: orgId,
      count: rateLimit.count,
      msg: 'SCIM rate limit exceeded',
    });
    return reply.status(429).send(
      createScimError(429, 'Too many requests. Rate limit: 100 requests per minute per organization', 'tooMany')
    );
  }
}
