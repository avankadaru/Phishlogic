/**
 * SSO Controller
 * HTTP handlers for SAML SSO endpoints
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getSSOService } from '../../core/services/sso.service.js';
import { getLogger } from '../../infrastructure/logging/logger.js';

const logger = getLogger();

// Zod schemas for validation

const SSOLoginQuerySchema = z.object({
  org: z.string().min(1).describe('Organization domain'),
  redirect: z.string().url().optional().describe('Redirect URL after login'),
});

const SAMLCallbackSchema = z.object({
  SAMLResponse: z.string().min(1),
  RelayState: z.string().optional(),
});

// ============================================================================
// SSO LOGIN ENDPOINTS
// ============================================================================

/**
 * Initiate SSO Login
 * GET /auth/saml/login?org=example.com
 */
export async function initiateSSOLogin(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { org, redirect } = SSOLoginQuerySchema.parse(request.query);

    const ssoService = getSSOService();
    const redirectUrl = await ssoService.initiateSSOLogin(
      org,
      redirect || org
    );

    logger.info({
      organization: org,
      msg: 'SSO login initiated',
    });

    // Redirect to IdP
    reply.status(302).redirect(redirectUrl);
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      query: request.query,
      msg: 'SSO login initiation failed',
    });

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: error.errors,
      });
    }

    reply.status(500).send({
      error: error instanceof Error ? error.message : 'SSO login failed',
    });
  }
}

/**
 * SAML Callback Handler
 * POST /auth/saml/callback
 */
export async function handleSAMLCallback(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const { SAMLResponse, RelayState } = SAMLCallbackSchema.parse(request.body);

    const ssoService = getSSOService();
    const result = await ssoService.handleSAMLCallback(SAMLResponse, RelayState);

    if (!result.success) {
      logger.warn({
        error: result.error,
        msg: 'SAML callback failed',
      });

      return reply.status(401).send({
        error: result.error || 'Authentication failed',
      });
    }

    logger.info({
      userId: result.user?.id,
      email: result.user?.email,
      msg: 'SAML callback successful',
    });

    // Return API key and user info
    reply.status(200).send({
      success: true,
      apiKey: result.apiKey,
      user: {
        id: result.user?.id,
        email: result.user?.email,
        displayName: result.user?.displayName,
        userName: result.user?.userName,
      },
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      msg: 'SAML callback error',
    });

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid SAML response',
        details: error.errors,
      });
    }

    reply.status(500).send({
      error: error instanceof Error ? error.message : 'Authentication failed',
    });
  }
}

/**
 * Get SAML Metadata
 * GET /auth/saml/metadata/:orgDomain
 */
export async function getSAMLMetadata(
  request: FastifyRequest<{ Params: { orgDomain: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { orgDomain } = request.params;

    const ssoService = getSSOService();
    const metadata = await ssoService.getSAMLMetadata(orgDomain);

    logger.info({
      organization: orgDomain,
      msg: 'SAML metadata requested',
    });

    reply
      .status(200)
      .header('Content-Type', 'application/xml')
      .send(metadata);
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      orgDomain: request.params.orgDomain,
      msg: 'SAML metadata request failed',
    });

    reply.status(404).send({
      error: error instanceof Error ? error.message : 'Organization not found',
    });
  }
}

/**
 * Get SSO Configuration for Organization
 * GET /auth/sso/config?org=example.com
 */
export async function getSSOConfig(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const org = request.query['org'];

    if (!org) {
      return reply.status(400).send({
        error: 'Organization domain required',
      });
    }

    // This would typically look up the organization and return SSO config
    // For now, return basic info
    reply.status(200).send({
      organization: org,
      ssoEnabled: true,
      loginUrl: `/auth/saml/login?org=${org}`,
      metadataUrl: `/auth/saml/metadata/${org}`,
    });
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
      msg: 'SSO config request failed',
    });

    reply.status(500).send({
      error: 'Failed to retrieve SSO configuration',
    });
  }
}
