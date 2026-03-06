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

  // Admin-only routes (requires admin authentication)
  fastify.post('/admin/keys', { preHandler: [authMiddleware, requireAdmin] }, createApiKey);
  fastify.get('/admin/keys', { preHandler: [authMiddleware, requireAdmin] }, listApiKeys);
  fastify.delete('/admin/keys/:id', { preHandler: [authMiddleware, requireAdmin] }, revokeApiKey);
}
