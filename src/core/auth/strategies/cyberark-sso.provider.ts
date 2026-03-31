/**
 * CyberArk Identity SSO Provider
 * Implements SAML 2.0 authentication for CyberArk Identity
 */

import { getLogger } from '../../../infrastructure/logging/logger.js';
import type {
  SSOProviderStrategy,
  SAMLConfig,
  SAMLValidationResult,
  SAMLUserInfo,
} from './sso-provider.strategy.js';

const logger = getLogger();

export class CyberArkSSOProvider implements SSOProviderStrategy {
  private config: SAMLConfig;

  constructor(config: SAMLConfig) {
    this.config = config;
  }

  getName(): string {
    return 'cyberark';
  }

  async validateSAMLAssertion(
    samlResponse: string,
    _relayState?: string
  ): Promise<SAMLValidationResult> {
    try {
      // Decode base64 SAML response
      const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');

      // Basic validation (production should use proper SAML library)
      if (!decoded.includes('<saml:Assertion') && !decoded.includes('<saml2:Assertion')) {
        return {
          valid: false,
          error: 'Invalid SAML response format',
        };
      }

      // Extract user info
      const userInfo = await this.extractUserInfo(samlResponse);

      return {
        valid: true,
        userInfo,
      };
    } catch (error) {
      logger.error({
        provider: 'cyberark',
        error: error instanceof Error ? error.message : String(error),
        msg: 'SAML validation error',
      });

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'SAML validation failed',
      };
    }
  }

  async extractUserInfo(samlResponse: string): Promise<SAMLUserInfo> {
    const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');

    // Extract NameID (externalId)
    const nameIdMatch = decoded.match(/<saml2?:NameID[^>]*>(.*?)<\/saml2?:NameID>/);
    const externalId = nameIdMatch ? nameIdMatch[1] : '';

    // CyberArk specific attribute mappings
    const email = this.extractAttribute(decoded, 'email') || this.extractAttribute(decoded, 'mail');
    const firstName = this.extractAttribute(decoded, 'given_name') || this.extractAttribute(decoded, 'givenName');
    const lastName = this.extractAttribute(decoded, 'family_name') || this.extractAttribute(decoded, 'surname');
    const displayName = this.extractAttribute(decoded, 'display_name') || `${firstName} ${lastName}`.trim();

    const userEmail = email || externalId || 'unknown@example.com';
    const result: SAMLUserInfo = {
      externalId: externalId || userEmail,
      email: userEmail,
      userName: userEmail,
      displayName: displayName || userEmail,
      attributes: {
        provider: 'cyberark',
        groups: this.extractGroups(decoded),
      },
    };

    if (firstName) result.firstName = firstName;
    if (lastName) result.lastName = lastName;

    return result;
  }

  generateMetadata(): string {
    const metadata = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${this.config.issuer}">
  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${this.config.callbackUrl}"
      index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

    return metadata;
  }

  async generateAuthRequest(relayState?: string): Promise<string> {
    const authRequest = `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="_${this.generateId()}"
                    Version="2.0"
                    IssueInstant="${new Date().toISOString()}"
                    Destination="${this.config.entryPoint}"
                    AssertionConsumerServiceURL="${this.config.callbackUrl}">
  <saml:Issuer>${this.config.issuer}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

    const encoded = Buffer.from(authRequest).toString('base64');
    const params = new URLSearchParams({
      SAMLRequest: encoded,
    });

    if (relayState) {
      params.append('RelayState', relayState);
    }

    return `${this.config.entryPoint}?${params.toString()}`;
  }

  // Helper methods

  private extractAttribute(xml: string, attributeName: string): string | undefined {
    const patterns = [
      new RegExp(`<saml2?:Attribute[^>]*Name="${attributeName}"[^>]*>\\s*<saml2?:AttributeValue[^>]*>(.*?)</saml2?:AttributeValue>`, 's'),
      new RegExp(`<saml2?:Attribute[^>]*FriendlyName="${attributeName}"[^>]*>\\s*<saml2?:AttributeValue[^>]*>(.*?)</saml2?:AttributeValue>`, 's'),
    ];

    for (const pattern of patterns) {
      const match = xml.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  private extractGroups(xml: string): string[] {
    const groups: string[] = [];
    const groupPattern = /<saml2?:Attribute[^>]*Name="(?:groups|memberOf)"[^>]*>(.*?)<\/saml2?:Attribute>/gs;
    const match = xml.match(groupPattern);

    if (match) {
      const valuePattern = /<saml2?:AttributeValue[^>]*>(.*?)<\/saml2?:AttributeValue>/g;
      let valueMatch;

      while ((valueMatch = valuePattern.exec(match[0])) !== null) {
        if (valueMatch[1]) {
          groups.push(valueMatch[1].trim());
        }
      }
    }

    return groups;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
