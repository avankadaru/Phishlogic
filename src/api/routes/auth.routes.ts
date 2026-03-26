import { FastifyInstance } from 'fastify';
import {
  loginAdmin,
  loginUser,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyAuth,
} from '../controllers/auth.controller.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware.js';

/**
 * Authentication routes
 * Handles admin login, user login, and API key management
 */
export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes (no auth required)
  fastify.post('/auth/login/admin', loginAdmin);
  fastify.post('/auth/login/user', loginUser);

  // Protected routes (requires authentication)
  fastify.post('/auth/verify', { preHandler: authMiddleware }, verifyAuth);

  // Admin-only API key routes (requires admin authentication)
  // Use separate scope to apply middleware via hooks (avoids type inference issues)
  await fastify.register(async (adminScope) => {
    adminScope.addHook('preHandler', authMiddleware);
    adminScope.addHook('preHandler', requireAdmin);

    adminScope.post('/admin/keys', createApiKey);
    adminScope.get('/admin/keys', listApiKeys);
    adminScope.delete('/admin/keys/:id', revokeApiKey);
  });
}
