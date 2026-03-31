/**
 * Azure AD SSO Provider
 * Implements SAML 2.0 authentication for Microsoft Azure Active Directory
 */

import { getLogger } from '../../../infrastructure/logging/logger.js';
import type {
  SSOProviderStrategy,
  SAMLConfig,
  SAMLValidationResult,
  SAMLUserInfo,
} from './sso-provider.strategy.js';

const logger = getLogger();

export class AzureADSSOProvider implements SSOProviderStrategy {
  private config: SAMLConfig;

  constructor(config: SAMLConfig) {
    this.config = config;
  }

  getName(): string {
    return 'azure-ad';
  }

  async validateSAMLAssertion(
    samlResponse: string,
    _relayState?: string
  ): Promise<SAMLValidationResult> {
    try {
      // Decode base64 SAML response
      const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');

      // Basic validation (production should use proper SAML library)
      if (!decoded.includes('<saml:Assertion') && !decoded.includes('<Assertion')) {
        return {
          valid: false,
          error: 'Invalid SAML response format',
        };
      }

      // Verify issuer matches Azure AD
      if (!decoded.includes('login.microsoftonline.com') && !decoded.includes('sts.windows.net')) {
        logger.warn({
          provider: 'azure-ad',
          msg: 'SAML response issuer does not match Azure AD',
        });
      }

      // Extract user info
      const userInfo = await this.extractUserInfo(samlResponse);

      return {
        valid: true,
        userInfo,
      };
    } catch (error) {
      logger.error({
        provider: 'azure-ad',
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

    // Extract NameID (externalId) - Azure AD typically uses objectidentifier
    const nameIdMatch = decoded.match(/<(?:saml:)?NameID[^>]*>(.*?)<\/(?:saml:)?NameID>/);
    const externalId = nameIdMatch ? nameIdMatch[1] : '';

    // Azure AD specific attribute mappings
    const email = this.extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress') ||
                  this.extractAttribute(decoded, 'emailaddress') ||
                  this.extractAttribute(decoded, 'email');

    const firstName = this.extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname') ||
                     this.extractAttribute(decoded, 'givenname');

    const lastName = this.extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname') ||
                    this.extractAttribute(decoded, 'surname');

    const displayName = this.extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name') ||
                       this.extractAttribute(decoded, 'name') ||
                       `${firstName} ${lastName}`.trim();

    const upn = this.extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn');

    const userEmail = email || upn || externalId || 'unknown@example.com';
    const result: SAMLUserInfo = {
      externalId: externalId || userEmail,
      email: userEmail,
      userName: upn || userEmail,
      displayName: displayName || userEmail,
      attributes: {
        provider: 'azure-ad',
        upn,
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
    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</md:NameIDFormat>
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
      new RegExp(`<(?:saml:)?Attribute[^>]*Name="${attributeName.replace(/\//g, '\\/')}"[^>]*>\\s*<(?:saml:)?AttributeValue[^>]*>(.*?)</(?:saml:)?AttributeValue>`, 's'),
      new RegExp(`<(?:saml:)?Attribute[^>]*FriendlyName="${attributeName}"[^>]*>\\s*<(?:saml:)?AttributeValue[^>]*>(.*?)</(?:saml:)?AttributeValue>`, 's'),
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
    const groupAttrName = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups';
    const pattern = new RegExp(`<(?:saml:)?Attribute[^>]*Name="${groupAttrName.replace(/\//g, '\\/')}"[^>]*>(.*?)</(?:saml:)?Attribute>`, 's');
    const match = xml.match(pattern);

    if (match && match[1]) {
      const valuePattern = /<(?:saml:)?AttributeValue[^>]*>(.*?)<\/(?:saml:)?AttributeValue>/g;
      let valueMatch;

      while ((valueMatch = valuePattern.exec(match[1])) !== null) {
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
