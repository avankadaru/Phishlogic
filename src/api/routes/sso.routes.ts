/**
 * SSO Routes
 * SAML 2.0 authentication endpoints
 */

import type { FastifyInstance } from 'fastify';
import {
  initiateSSOLogin,
  handleSAMLCallback,
  getSAMLMetadata,
  getSSOConfig,
} from '../controllers/sso.controller.js';

/**
 * Register SSO routes
 */
export async function registerSSORoutes(
  server: FastifyInstance
): Promise<void> {
  // SSO Login Initiation
  server.get('/auth/saml/login', initiateSSOLogin);

  // SAML Callback (IdP sends SAML response here)
  server.post('/auth/saml/callback', handleSAMLCallback);

  // SAML Metadata (Service Provider metadata for IdP configuration)
  server.get('/auth/saml/metadata/:orgDomain', getSAMLMetadata);

  // SSO Configuration Lookup
  server.get('/auth/sso/config', getSSOConfig);
}
