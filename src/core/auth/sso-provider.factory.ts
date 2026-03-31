/**
 * SSO Provider Factory
 * Manages registration and retrieval of SSO provider strategies
 */

import { getLogger } from '../../infrastructure/logging/logger.js';
import type { SSOProviderStrategy, SAMLConfig } from './strategies/sso-provider.strategy.js';
import { CyberArkSSOProvider } from './strategies/cyberark-sso.provider.js';
import { OktaSSOProvider } from './strategies/okta-sso.provider.js';
import { AzureADSSOProvider } from './strategies/azure-ad-sso.provider.js';
import { Auth0SSOProvider } from './strategies/auth0-sso.provider.js';

const logger = getLogger();

export class SSOProviderFactory {
  private providers: Map<string, SSOProviderStrategy>;

  constructor() {
    this.providers = new Map();
  }

  /**
   * Register a provider strategy
   */
  register(name: string, provider: SSOProviderStrategy): void {
    this.providers.set(name.toLowerCase(), provider);
    logger.info({
      provider: name,
      msg: 'SSO provider registered',
    });
  }

  /**
   * Get provider by name
   */
  getProvider(name: string): SSOProviderStrategy {
    const provider = this.providers.get(name.toLowerCase());

    if (!provider) {
      throw new Error(`SSO provider not found: ${name}`);
    }

    return provider;
  }

  /**
   * Check if provider exists
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create provider instance from config
   */
  static createProvider(
    providerName: string,
    config: SAMLConfig
  ): SSOProviderStrategy {
    const name = providerName.toLowerCase();

    switch (name) {
      case 'cyberark':
        return new CyberArkSSOProvider(config);

      case 'okta':
        return new OktaSSOProvider(config);

      case 'azure-ad':
      case 'azuread':
        return new AzureADSSOProvider(config);

      case 'auth0':
        return new Auth0SSOProvider(config);

      default:
        throw new Error(`Unknown SSO provider: ${providerName}`);
    }
  }
}

// Singleton instance
let factoryInstance: SSOProviderFactory | null = null;

/**
 * Get or create SSO Provider Factory instance
 */
export function getSSOProviderFactory(): SSOProviderFactory {
  if (!factoryInstance) {
    factoryInstance = new SSOProviderFactory();
  }

  return factoryInstance;
}

/**
 * Reset factory (useful for testing)
 */
export function resetSSOProviderFactory(): void {
  factoryInstance = null;
}
