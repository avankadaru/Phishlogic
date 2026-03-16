/**
 * Sender Reputation Analyzer
 * Performs systematic validation of email sender using standard packages
 *
 * Replaces keyword-based detection with:
 * - Email format validation (RFC 5322)
 * - DNS record validation (MX, A, SPF, DMARC)
 * - Domain age verification (WHOIS)
 * - Domain reputation checking
 */

import validator from 'validator';
import { promises as dns } from 'dns';
import whois from 'whois-json';
import NodeCache from 'node-cache';
import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';

const logger = getLogger();

interface EmailFormatResult {
  valid: boolean;
  isDisposable: boolean;
  isRoleBased: boolean;
}

interface DNSValidationResult {
  hasMX: boolean;
  hasA: boolean;
  hasSPF: boolean;
  hasDMARC: boolean;
  mxRecords?: string[];
  txtRecords?: string[];
}

interface DomainAgeResult {
  createdDate?: Date;
  ageInDays?: number;
  hasPrivacyProtection: boolean;
  isRecentlyRegistered: boolean;
}

interface DomainReputationResult {
  isBlacklisted: boolean;
  category?: string;
  reasons: string[];
}

/**
 * Sender Reputation Analyzer
 * Systematically validates email sender using multiple parallel checks
 */
export class SenderReputationAnalyzer extends BaseAnalyzer {
  private cache: NodeCache;

  // Known disposable email domains (can be expanded)
  private disposableDomains = new Set([
    'tempmail.com',
    '10minutemail.com',
    'guerrillamail.com',
    'mailinator.com',
    'throwaway.email',
    'temp-mail.org',
  ]);

  // Known phishing/spam domains (can be expanded or integrated with external API)
  private blacklistedDomains = new Set([
    'paypa1.com',
    'g00gle.com',
    'amaz0n.com',
  ]);

  // Analyzer-specific options (configurable per integration)
  private enableWhois: boolean = true;
  private whoisTimeoutMs: number = 10000;
  private dnsTimeoutMs: number = 10000;

  constructor() {
    super();
    // Cache results for 1 hour to avoid repeated lookups
    this.cache = new NodeCache({ stdTTL: 3600 });
  }

  /**
   * Set analyzer options from integration config
   * Called by execution strategy before analysis
   */
  setOptions(options: Record<string, any>): void {
    if (options.enableWhois !== undefined) {
      this.enableWhois = options.enableWhois;
    }
    if (options.whoisTimeoutMs !== undefined) {
      this.whoisTimeoutMs = options.whoisTimeoutMs;
    }
    if (options.dnsTimeoutMs !== undefined) {
      this.dnsTimeoutMs = options.dnsTimeoutMs;
    }

    logger.debug({
      msg: 'SenderReputationAnalyzer options configured',
      enableWhois: this.enableWhois,
      whoisTimeoutMs: this.whoisTimeoutMs,
      dnsTimeoutMs: this.dnsTimeoutMs,
    });
  }

  /**
   * Wrap promise with timeout using Promise.race
   * Returns default value if timeout occurs
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(defaultValue), timeoutMs)),
    ]);
  }

  getName(): string {
    return 'SenderReputationAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.senderReputation; // Configurable from env (default: 1.8)
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const signals: AnalysisSignal[] = [];
    const fromAddress = input.data.parsed.from.address;
    const domain = fromAddress.split('@')[1];

    if (!domain) {
      signals.push(
        this.createSignal({
          signalType: 'invalid_email_format',
          severity: 'high',
          confidence: 0.95,
          description: 'Email address has invalid format (missing domain)',
          evidence: { email: fromAddress },
        })
      );
      return signals;
    }

    logger.debug({
      msg: 'Starting sender reputation analysis',
      email: fromAddress,
      domain,
    });

    // Execute fast checks in parallel (DNS, format, reputation)
    const [formatResult, dnsResult, reputationResult] = await Promise.allSettled([
      this.validateEmailFormat(fromAddress, domain),
      this.checkDNSRecords(domain),
      this.checkDomainReputation(domain),
    ]);

    // Smart WHOIS skip: Skip if disabled OR DNS shows critical issues
    const dnsHasCriticalIssues =
      dnsResult.status === 'fulfilled' && (!dnsResult.value.hasMX || !dnsResult.value.hasA);
    const skipWhois = !this.enableWhois || dnsHasCriticalIssues;

    let ageResult: PromiseSettledResult<DomainAgeResult> | null = null;

    if (!skipWhois) {
      // WHOIS enabled and DNS looks okay - check domain age
      const agePromise = this.checkDomainAge(domain);
      ageResult = await Promise.allSettled([agePromise]).then((results) => results[0]);
    } else {
      logger.debug({
        msg: 'WHOIS lookup skipped',
        domain,
        reason: !this.enableWhois ? 'disabled' : 'dns_critical_failure',
        dnsHasMX: dnsResult.status === 'fulfilled' ? dnsResult.value.hasMX : false,
        dnsHasA: dnsResult.status === 'fulfilled' ? dnsResult.value.hasA : false,
      });
    }

    // Process email format validation results
    if (formatResult.status === 'fulfilled' && formatResult.value) {
      const format = formatResult.value;

      if (!format.valid) {
        signals.push(
          this.createSignal({
            signalType: 'invalid_email_format',
            severity: 'high',
            confidence: 0.9,
            description: 'Email address does not comply with RFC 5322 standard',
            evidence: { email: fromAddress },
          })
        );
      }

      if (format.isDisposable) {
        signals.push(
          this.createSignal({
            signalType: 'disposable_email',
            severity: 'high',
            confidence: 0.85,
            description: 'Sender uses a disposable/temporary email service',
            evidence: { email: fromAddress, domain },
          })
        );
      }

      if (format.isRoleBased) {
        signals.push(
          this.createSignal({
            signalType: 'role_based_email',
            severity: 'low',
            confidence: 0.6,
            description: 'Sender email is role-based (admin, noreply, etc.) - common in phishing',
            evidence: { email: fromAddress },
          })
        );
      }
    } else if (formatResult.status === 'rejected') {
      logger.warn({
        msg: 'Email format validation failed',
        error: formatResult.reason,
        email: fromAddress,
      });
    }

    // Process DNS validation results
    if (dnsResult.status === 'fulfilled' && dnsResult.value) {
      const dns = dnsResult.value;

      if (!dns.hasMX) {
        signals.push(
          this.createSignal({
            signalType: 'mx_record_missing',
            severity: 'high',
            confidence: 0.9,
            description: 'Domain has no MX records - cannot receive email legitimately',
            evidence: { domain },
          })
        );
      }

      if (!dns.hasA) {
        signals.push(
          this.createSignal({
            signalType: 'dns_a_record_missing',
            severity: 'medium',
            confidence: 0.7,
            description: 'Domain has no A records - suspicious DNS configuration',
            evidence: { domain },
          })
        );
      }

      if (!dns.hasSPF) {
        signals.push(
          this.createSignal({
            signalType: 'spf_not_configured',
            severity: 'medium',
            confidence: 0.6,
            description: 'Domain has no SPF record configured - higher spoofing risk',
            evidence: { domain },
          })
        );
      }

      if (!dns.hasDMARC) {
        signals.push(
          this.createSignal({
            signalType: 'dmarc_not_configured',
            severity: 'low',
            confidence: 0.5,
            description: 'Domain has no DMARC policy - less email security',
            evidence: { domain },
          })
        );
      }
    } else if (dnsResult.status === 'rejected') {
      logger.warn({
        msg: 'DNS validation failed',
        error: dnsResult.reason,
        domain,
      });

      signals.push(
        this.createSignal({
          signalType: 'dns_lookup_failed',
          severity: 'medium',
          confidence: 0.7,
          description: 'Could not resolve domain DNS records - domain may not exist',
          evidence: { domain, error: String(dnsResult.reason) },
        })
      );
    }

    // Process domain age results
    if (ageResult.status === 'fulfilled' && ageResult.value) {
      const age = ageResult.value;

      if (age.isRecentlyRegistered) {
        signals.push(
          this.createSignal({
            signalType: 'domain_recently_registered',
            severity: 'high',
            confidence: 0.8,
            description: `Domain was registered recently (${age.ageInDays} days ago) - common in phishing`,
            evidence: {
              domain,
              createdDate: age.createdDate?.toISOString(),
              ageInDays: age.ageInDays,
            },
          })
        );
      }

      if (age.hasPrivacyProtection) {
        signals.push(
          this.createSignal({
            signalType: 'whois_privacy_protection',
            severity: 'low',
            confidence: 0.5,
            description: 'Domain uses WHOIS privacy protection - owner identity hidden',
            evidence: { domain },
          })
        );
      }
    } else if (ageResult.status === 'rejected') {
      logger.debug({
        msg: 'WHOIS lookup failed (non-critical)',
        error: ageResult.reason,
        domain,
      });
      // WHOIS failures are common and not necessarily suspicious
    }

    // Process domain reputation results
    if (reputationResult.status === 'fulfilled' && reputationResult.value) {
      const reputation = reputationResult.value;

      if (reputation.isBlacklisted) {
        signals.push(
          this.createSignal({
            signalType: 'domain_blacklisted',
            severity: 'critical',
            confidence: 0.95,
            description: `Domain is on phishing/spam blacklist: ${reputation.reasons.join(', ')}`,
            evidence: {
              domain,
              reasons: reputation.reasons,
              category: reputation.category,
            },
          })
        );
      }
    } else if (reputationResult.status === 'rejected') {
      logger.warn({
        msg: 'Domain reputation check failed',
        error: reputationResult.reason,
        domain,
      });
    }

    logger.debug({
      msg: 'Sender reputation analysis complete',
      email: fromAddress,
      signalsFound: signals.length,
    });

    return signals;
  }

  /**
   * Validate email format using validator package
   */
  private async validateEmailFormat(email: string, domain: string): Promise<EmailFormatResult> {
    const cacheKey = `format:${email}`;
    const cached = this.cache.get<EmailFormatResult>(cacheKey);
    if (cached) return cached;

    const result: EmailFormatResult = {
      valid: validator.isEmail(email),
      isDisposable: this.disposableDomains.has(domain.toLowerCase()),
      isRoleBased: this.isRoleBasedEmail(email),
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Check if email is role-based (admin, noreply, etc.)
   */
  private isRoleBasedEmail(email: string): boolean {
    const localPart = email.split('@')[0]?.toLowerCase() || '';
    const rolePrefixes = [
      'admin',
      'administrator',
      'noreply',
      'no-reply',
      'donotreply',
      'info',
      'support',
      'help',
      'contact',
      'sales',
      'billing',
      'accounts',
    ];

    return rolePrefixes.some((prefix) => localPart === prefix || localPart.startsWith(prefix));
  }

  /**
   * Check DNS records for domain (MX, A, SPF, DMARC)
   */
  private async checkDNSRecords(domain: string): Promise<DNSValidationResult> {
    const cacheKey = `dns:${domain}`;
    const cached = this.cache.get<DNSValidationResult>(cacheKey);
    if (cached) return cached;

    const result: DNSValidationResult = {
      hasMX: false,
      hasA: false,
      hasSPF: false,
      hasDMARC: false,
    };

    try {
      // Check MX records with timeout
      try {
        const mxRecords = await this.withTimeout(dns.resolveMx(domain), this.dnsTimeoutMs, []);
        result.hasMX = mxRecords.length > 0;
        result.mxRecords = mxRecords.map((mx) => mx.exchange);
      } catch (error) {
        logger.debug({ msg: 'MX lookup failed', domain, error });
      }

      // Check A records with timeout
      try {
        const aRecords = await this.withTimeout(dns.resolve4(domain), this.dnsTimeoutMs, []);
        result.hasA = aRecords.length > 0;
      } catch (error) {
        logger.debug({ msg: 'A record lookup failed', domain, error });
      }

      // Check TXT records for SPF and DMARC with timeout
      try {
        const txtRecords = await this.withTimeout(dns.resolveTxt(domain), this.dnsTimeoutMs, []);
        result.txtRecords = txtRecords.map((record) => record.join(''));

        // Check for SPF record
        result.hasSPF = result.txtRecords.some((record) => record.startsWith('v=spf1'));

        // Check for DMARC (requires _dmarc subdomain) with timeout
        try {
          const dmarcRecords = await this.withTimeout(
            dns.resolveTxt(`_dmarc.${domain}`),
            this.dnsTimeoutMs,
            []
          );
          result.hasDMARC = dmarcRecords.some((record) => record.join('').startsWith('v=DMARC1'));
        } catch (error) {
          // DMARC not found - not critical
        }
      } catch (error) {
        logger.debug({ msg: 'TXT record lookup failed', domain, error });
      }

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error({
        msg: 'DNS validation error',
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check domain age using WHOIS lookup
   */
  private async checkDomainAge(domain: string): Promise<DomainAgeResult> {
    const cacheKey = `whois:${domain}`;
    const cached = this.cache.get<DomainAgeResult>(cacheKey);
    if (cached) return cached;

    try {
      // Apply timeout to WHOIS lookup (default 10s)
      const whoisData = await this.withTimeout(whois(domain), this.whoisTimeoutMs, null);

      if (!whoisData) {
        logger.debug({
          msg: 'WHOIS lookup timed out',
          domain,
          timeoutMs: this.whoisTimeoutMs,
        });
        throw new Error('WHOIS timeout');
      }

      const result: DomainAgeResult = {
        hasPrivacyProtection: false,
        isRecentlyRegistered: false,
      };

      // Extract creation date (whois-json returns any type, so we need to cast)
      const data = whoisData as Record<string, any>;
      if (data['createdDate'] || data['creationDate'] || data['created']) {
        const dateStr = data['createdDate'] || data['creationDate'] || data['created'];
        const createdDate = new Date(dateStr);
        if (!isNaN(createdDate.getTime())) {
          result.createdDate = createdDate;
          const now = new Date();
          const ageInMs = now.getTime() - createdDate.getTime();
          result.ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

          // Flag domains registered within last 30 days
          result.isRecentlyRegistered = result.ageInDays < 30;
        }
      }

      // Check for privacy protection
      const registrantOrg = String(data['registrantOrganization'] || data['registrant'] || '').toLowerCase();
      const registrantName = String(data['registrantName'] || data['registrant'] || '').toLowerCase();

      result.hasPrivacyProtection =
        registrantOrg.includes('privacy') ||
        registrantOrg.includes('private') ||
        registrantOrg.includes('redacted') ||
        registrantName.includes('privacy') ||
        registrantName.includes('private') ||
        registrantName.includes('redacted');

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.debug({
        msg: 'WHOIS lookup failed',
        domain,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check domain reputation against known blacklists
   * TODO: Integrate with external reputation APIs (VirusTotal, etc.)
   */
  private async checkDomainReputation(domain: string): Promise<DomainReputationResult> {
    const cacheKey = `reputation:${domain}`;
    const cached = this.cache.get<DomainReputationResult>(cacheKey);
    if (cached) return cached;

    const result: DomainReputationResult = {
      isBlacklisted: false,
      reasons: [],
    };

    // Check against local blacklist
    if (this.blacklistedDomains.has(domain.toLowerCase())) {
      result.isBlacklisted = true;
      result.reasons.push('Known typosquatting domain');
      result.category = 'phishing';
    }

    // Check for suspicious patterns in domain
    if (this.hasSuspiciousDomainPattern(domain)) {
      result.isBlacklisted = true;
      result.reasons.push('Suspicious domain pattern detected');
      result.category = 'suspicious';
    }

    // TODO: Add external API checks here (VirusTotal, Google Safe Browsing, etc.)
    // This will be implemented in Phase 2 (Link Reputation Analyzer)

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Check for suspicious patterns in domain name
   */
  private hasSuspiciousDomainPattern(domain: string): boolean {
    const lowerDomain = domain.toLowerCase();

    // Check for excessive hyphens (often used in phishing)
    const hyphenCount = (lowerDomain.match(/-/g) || []).length;
    if (hyphenCount > 3) return true;

    // Check for numbers mixed with brand names (paypa1, g00gle)
    const suspiciousPatterns = [
      /paypa[l1]/,
      /g[o0]{2}gle/,
      /amaz[o0]n/,
      /faceb[o0]{2}k/,
      /app[l1]e/,
      /micr[o0]s[o0]ft/,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(lowerDomain));
  }
}
