/**
 * SSO Service
 * Handles SAML authentication, user lookup, JIT provisioning, and session management
 */

import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../infrastructure/logging/logger.js';
import { getUserRepository } from '../../infrastructure/database/repositories/user.repository.js';
import { getOrganizationRepository } from '../../infrastructure/database/repositories/organization.repository.js';
import { getAuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { SSOProviderFactory } from '../auth/sso-provider.factory.js';
import type { SAMLConfig, SAMLUserInfo } from '../auth/strategies/sso-provider.strategy.js';
import type { UserDomain } from '../models/user.model.js';

const logger = getLogger();

export interface SSOLoginResult {
  success: boolean;
  user?: UserDomain;
  apiKey?: string;
  error?: string;
}

export interface ISSoService {
  handleSAMLCallback(
    samlResponse: string,
    relayState?: string
  ): Promise<SSOLoginResult>;

  initiateSSOLogin(
    organizationDomain: string,
    relayState?: string
  ): Promise<string>;

  getSAMLMetadata(organizationDomain: string): Promise<string>;
}

export class SSOService implements ISSoService {
  constructor(_factory?: SSOProviderFactory) {
    // Factory parameter kept for testability but not used in production
    void _factory;
  }

  /**
   * Handle SAML callback from IdP
   */
  async handleSAMLCallback(
    samlResponse: string,
    relayState?: string
  ): Promise<SSOLoginResult> {
    try {
      // Extract organization from relay state or SAML response
      const orgDomain = relayState || this.extractOrgFromSAML(samlResponse);

      if (!orgDomain) {
        return {
          success: false,
          error: 'Organization domain not found in SAML response',
        };
      }

      // Look up organization
      const orgRepo = getOrganizationRepository();
      const org = await orgRepo.findByDomain(orgDomain);

      if (!org) {
        return {
          success: false,
          error: `Organization not found: ${orgDomain}`,
        };
      }

      if (!org.ssoEnabled) {
        return {
          success: false,
          error: 'SSO is not enabled for this organization',
        };
      }

      if (!org.ssoProvider) {
        return {
          success: false,
          error: 'SSO provider not configured for organization',
        };
      }

      // Get SSO provider strategy
      const config = this.buildSAMLConfig(org.ssoMetadata || {}, org.domain);
      const provider = SSOProviderFactory.createProvider(org.ssoProvider, config);

      // Validate SAML assertion
      const validationResult = await provider.validateSAMLAssertion(samlResponse);

      if (!validationResult.valid || !validationResult.userInfo) {
        logger.warn({
          organizationId: org.id,
          provider: org.ssoProvider,
          error: validationResult.error,
          msg: 'SAML validation failed',
        });

        return {
          success: false,
          error: validationResult.error || 'SAML validation failed',
        };
      }

      // Look up or provision user
      const user = await this.findOrProvisionUser(
        validationResult.userInfo,
        org.id
      );

      // Generate API key if not exists
      let apiKey = user.apiKey;
      if (!apiKey) {
        apiKey = this.generateApiKey();
        const userRepo = getUserRepository();
        await userRepo.update(user.id, { apiKey });
      }

      // Update last login
      const userRepo = getUserRepository();
      await userRepo.updateLastLogin(user.id);

      // Log SSO login event
      await this.logSSOLogin(user, org.id, org.ssoProvider);

      logger.info({
        userId: user.id,
        organizationId: org.id,
        provider: org.ssoProvider,
        msg: 'SSO login successful',
      });

      return {
        success: true,
        user,
        apiKey,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        msg: 'SSO callback error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'SSO authentication failed',
      };
    }
  }

  /**
   * Initiate SSO login (redirect to IdP)
   */
  async initiateSSOLogin(
    organizationDomain: string,
    relayState?: string
  ): Promise<string> {
    const orgRepo = getOrganizationRepository();
    const org = await orgRepo.findByDomain(organizationDomain);

    if (!org) {
      throw new Error(`Organization not found: ${organizationDomain}`);
    }

    if (!org.ssoEnabled) {
      throw new Error('SSO is not enabled for this organization');
    }

    if (!org.ssoProvider) {
      throw new Error('SSO provider not configured');
    }

    const config = this.buildSAMLConfig(org.ssoMetadata || {}, org.domain);
    const provider = SSOProviderFactory.createProvider(org.ssoProvider, config);

    // Generate SAML AuthN request and get redirect URL
    const redirectUrl = await provider.generateAuthRequest(
      relayState || organizationDomain
    );

    logger.info({
      organizationId: org.id,
      provider: org.ssoProvider,
      msg: 'SSO login initiated',
    });

    return redirectUrl;
  }

  /**
   * Get SAML metadata for organization (Service Provider metadata)
   */
  async getSAMLMetadata(organizationDomain: string): Promise<string> {
    const orgRepo = getOrganizationRepository();
    const org = await orgRepo.findByDomain(organizationDomain);

    if (!org) {
      throw new Error(`Organization not found: ${organizationDomain}`);
    }

    if (!org.ssoEnabled || !org.ssoProvider) {
      throw new Error('SSO not configured for this organization');
    }

    const config = this.buildSAMLConfig(org.ssoMetadata || {}, org.domain);
    const provider = SSOProviderFactory.createProvider(org.ssoProvider, config);

    return provider.generateMetadata();
  }

  // Private helper methods

  private async findOrProvisionUser(
    userInfo: SAMLUserInfo,
    organizationId: string
  ): Promise<UserDomain> {
    const userRepo = getUserRepository();

    // Try to find by external ID first (most reliable)
    let user = userInfo.externalId
      ? await userRepo.findByExternalId(userInfo.externalId)
      : null;

    // Fall back to email lookup
    if (!user) {
      user = await userRepo.findByEmail(userInfo.email);
    }

    // JIT (Just-In-Time) provisioning
    if (!user) {
      logger.info({
        email: userInfo.email,
        externalId: userInfo.externalId,
        organizationId,
        msg: 'JIT provisioning user from SSO',
      });

      user = await userRepo.insert({
        id: uuidv4(),
        externalId: userInfo.externalId,
        userName: userInfo.userName,
        email: userInfo.email,
        givenName: userInfo.firstName,
        familyName: userInfo.lastName,
        displayName: userInfo.displayName,
        active: true,
        organizationId,
        userType: 'organization',
        userAttributes: userInfo.attributes || {},
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      // Update user info from SSO
      const updated = await userRepo.update(user.id, {
        externalId: userInfo.externalId,
        userName: userInfo.userName,
        givenName: userInfo.firstName,
        familyName: userInfo.lastName,
        displayName: userInfo.displayName,
        active: true,
        organizationId,
        userAttributes: {
          ...user.userAttributes,
          ...userInfo.attributes,
        },
      });
      if (updated) {
        user = updated;
      }
    }

    return user;
  }

  private async logSSOLogin(
    user: UserDomain,
    organizationId: string,
    provider: string
  ): Promise<void> {
    const auditRepo = getAuditLogRepository();

    await auditRepo.insert({
      id: uuidv4(),
      eventName: 'user.sso_login',
      eventType: 'sso',
      occurredAt: new Date(),
      loggedAt: new Date(),
      entityType: 'user',
      entityId: user.id,
      entityName: user.displayName || user.email,
      actorType: 'user',
      actorId: user.id,
      actorName: user.displayName || user.email,
      organizationId,
      source: 'sso_api',
      eventMetadata: {
        provider,
        email: user.email,
        userName: user.userName,
      },
      success: true,
    });
  }

  private buildSAMLConfig(
    ssoMetadata: Record<string, any>,
    orgDomain: string
  ): SAMLConfig {
    const baseUrl =
      process.env['API_BASE_URL'] ||
      `http://localhost:${process.env['PORT'] || 3000}`;

    return {
      entryPoint: ssoMetadata['ssoUrl'] || ssoMetadata['entryPoint'] || '',
      issuer: ssoMetadata['entityId'] || `${baseUrl}/saml/metadata/${orgDomain}`,
      callbackUrl: `${baseUrl}/auth/saml/callback`,
      cert: ssoMetadata['certificate'] || '',
      privateKey: ssoMetadata['privateKey'],
      signatureAlgorithm: ssoMetadata['signatureAlgorithm'] || 'sha256',
      identifierFormat:
        ssoMetadata['identifierFormat'] ||
        'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    };
  }

  private extractOrgFromSAML(samlResponse: string): string | null {
    try {
      const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');
      // Try to extract organization domain from issuer or audience
      const issuerMatch = decoded.match(/<saml2?:Issuer[^>]*>(.*?)<\/saml2?:Issuer>/);
      if (issuerMatch && issuerMatch[1]) {
        // Extract domain from URL if present
        const urlMatch = issuerMatch[1].match(/\/\/([^/]+)/);
        if (urlMatch && urlMatch[1]) {
          return urlMatch[1];
        }
      }
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        msg: 'Failed to extract organization from SAML',
      });
    }

    return null;
  }

  private generateApiKey(): string {
    return `pl_${uuidv4().replace(/-/g, '')}`;
  }
}

// Singleton instance
let ssoServiceInstance: SSOService | null = null;

/**
 * Get or create SSO Service instance
 */
export function getSSOService(): SSOService {
  if (!ssoServiceInstance) {
    ssoServiceInstance = new SSOService();
  }

  return ssoServiceInstance;
}

/**
 * Reset service (useful for testing)
 */
export function resetSSOService(): void {
  ssoServiceInstance = null;
}
