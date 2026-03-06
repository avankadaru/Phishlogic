/**
 * API routes
 */

import type { FastifyInstance } from 'fastify';
import {
  analyzeUrl,
  analyzeEmail,
  healthCheck,
} from '../controllers/analysis.controller.js';
import {
  getWhitelistEntries,
  getWhitelistEntry,
  addWhitelistEntry,
  deleteWhitelistEntry,
  getWhitelistStats,
} from '../controllers/whitelist.controller.js';
import { authRoutes } from './auth.routes.js';
import { adminRoutes } from './admin.routes.js';
// Schemas are validated in controllers

/**
 * Register all API routes
 */
export async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Health check
  server.get('/health', healthCheck);

  // Analysis endpoints
  server.post('/api/v1/analyze/url', analyzeUrl);

  server.post('/api/v1/analyze/email', analyzeEmail);

  // Whitelist endpoints (public/legacy)
  server.get('/api/v1/whitelist', getWhitelistEntries);

  server.get('/api/v1/whitelist/stats', getWhitelistStats);

  server.get('/api/v1/whitelist/:id', getWhitelistEntry);

  server.post('/api/v1/whitelist', addWhitelistEntry);

  server.delete('/api/v1/whitelist/:id', deleteWhitelistEntry);

  // Authentication routes
  await server.register(authRoutes, { prefix: '/api' });

  // Admin panel routes
  await server.register(adminRoutes, { prefix: '/api' });
}
