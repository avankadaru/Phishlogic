/**
 * SCIM 2.0 Routes
 * RFC 7644 compliant endpoint registration
 */

import { FastifyInstance } from 'fastify';
import {
  getServiceProviderConfig,
  getSchemas,
  getResourceTypes,
  createUser,
  getUser,
  listUsers,
  updateUser,
  patchUser,
  deleteUser,
  createGroup,
  getGroup,
  listGroups,
  patchGroup,
  deleteGroup,
} from '../controllers/scim.controller.js';
import { scimAuthMiddleware, scimRateLimitMiddleware } from '../middleware/scim-auth.middleware.js';
import { getLogger } from '../../infrastructure/logging/logger.js';

const logger = getLogger();

/**
 * Register SCIM routes
 */
export async function registerScimRoutes(server: FastifyInstance): Promise<void> {
  logger.info('Registering SCIM 2.0 routes');

  // ============================================================================
  // SERVICE DISCOVERY ENDPOINTS (No auth required per RFC)
  // ============================================================================

  server.get('/scim/v2/ServiceProviderConfig', getServiceProviderConfig);
  server.get('/scim/v2/Schemas', getSchemas);
  server.get('/scim/v2/ResourceTypes', getResourceTypes);

  // ============================================================================
  // AUTHENTICATED ENDPOINTS
  // Apply auth and rate limiting middleware to all protected routes
  // ============================================================================

  server.register(async (authenticatedServer: FastifyInstance) => {
    // Apply middleware
    authenticatedServer.addHook('onRequest', scimAuthMiddleware);
    authenticatedServer.addHook('onRequest', scimRateLimitMiddleware);

    // Content-Type validation for SCIM
    authenticatedServer.addHook('onRequest', async (request, reply) => {
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const contentType = request.headers['content-type'];
        if (!contentType || (!contentType.includes('application/json') && !contentType.includes('application/scim+json'))) {
          return reply.status(400).send({
            schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
            status: '400',
            detail: 'Content-Type must be application/json or application/scim+json',
          });
        }
      }
    });

    // ========== USER ENDPOINTS ==========

    // Create user
    authenticatedServer.post('/scim/v2/Users', createUser);

    // Get user by ID
    authenticatedServer.get('/scim/v2/Users/:id', getUser);

    // List users (with optional filtering)
    authenticatedServer.get('/scim/v2/Users', listUsers);

    // Update user (PUT - full replacement)
    authenticatedServer.put('/scim/v2/Users/:id', updateUser);

    // Patch user (PATCH - partial update)
    authenticatedServer.patch('/scim/v2/Users/:id', patchUser);

    // Delete user (deactivate)
    authenticatedServer.delete('/scim/v2/Users/:id', deleteUser);

    // ========== GROUP ENDPOINTS ==========

    // Create group
    authenticatedServer.post('/scim/v2/Groups', createGroup);

    // Get group by ID
    authenticatedServer.get('/scim/v2/Groups/:id', getGroup);

    // List groups (with optional filtering)
    authenticatedServer.get('/scim/v2/Groups', listGroups);

    // Patch group (update membership)
    authenticatedServer.patch('/scim/v2/Groups/:id', patchGroup);

    // Delete group
    authenticatedServer.delete('/scim/v2/Groups/:id', deleteGroup);
  });

  logger.info('✓ SCIM 2.0 routes registered successfully');
  logger.info('  - Service discovery: /scim/v2/ServiceProviderConfig');
  logger.info('  - User endpoints: /scim/v2/Users');
  logger.info('  - Group endpoints: /scim/v2/Groups');
}
