/**
 * SSO Provider Strategy Interface
 * Defines contract for SAML 2.0 SSO providers
 */

export interface SAMLUserInfo {
  externalId: string; // NameID from SAML assertion
  email: string;
  userName: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  attributes?: Record<string, any>;
}

export interface SAMLValidationResult {
  valid: boolean;
  error?: string;
  userInfo?: SAMLUserInfo;
}

export interface SAMLConfig {
  entryPoint: string; // IdP SSO URL
  issuer: string; // PhishLogic entity ID
  callbackUrl: string; // PhishLogic callback URL
  cert: string; // IdP certificate (PEM format)
  privateKey?: string; // SP private key (optional)
  signatureAlgorithm?: string;
  identifierFormat?: string;
}

/**
 * Strategy pattern interface for SSO providers
 */
export interface SSOProviderStrategy {
  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Validate SAML assertion from IdP
   */
  validateSAMLAssertion(
    samlResponse: string,
    relayState?: string
  ): Promise<SAMLValidationResult>;

  /**
   * Extract user information from SAML assertion
   */
  extractUserInfo(samlResponse: string): Promise<SAMLUserInfo>;

  /**
   * Generate SAML metadata XML for PhishLogic (Service Provider)
   */
  generateMetadata(): string;

  /**
   * Generate SAML AuthN request (redirect to IdP)
   */
  generateAuthRequest(relayState?: string): Promise<string>;
}
