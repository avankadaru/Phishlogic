/**
 * URL Entropy Analyzer
 * Detects suspicious URLs with high entropy (random-looking strings)
 */

import { isIPv4, isIPv6 } from 'node:net';
import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput, isUrlInput } from '../../models/input.js';
import { isKnownBrandTyposquatHost } from '../../constants/typo-domain-blocklist.js';

/**
 * High entropy threshold for detecting suspicious URLs
 */
const HIGH_ENTROPY_THRESHOLD = 4.5;

/**
 * Minimum URL length to analyze (avoid false positives on short URLs)
 */
const MIN_URL_LENGTH = 10;

/**
 * URL Entropy Analyzer
 */
export class UrlEntropyAnalyzer extends BaseAnalyzer {
  getName(): string {
    return 'UrlEntropyAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.urlEntropy; // Configurable from env (default: 1.2)
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Applicable to both URL and Email inputs
    if (isUrlInput(input)) {
      return true;
    }
    if (isEmailInput(input)) {
      // Check if email has extracted URLs
      return (input.data.parsed.urls?.length ?? 0) > 0;
    }
    return false;
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    // Get URLs to analyze
    const urls = this.extractUrls(input);

    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname;
        const hostForChecks = hostname.toLowerCase();
        const rawHostForIp = hostForChecks.replace(/^\[|\]$/g, '');

        if (isKnownBrandTyposquatHost(hostForChecks)) {
          signals.push(
            this.createSignal({
              signalType: 'typosquat_hostname',
              severity: 'high',
              confidence: 0.92,
              description: 'Hostname closely mimics a well-known brand (typosquat or homoglyph)',
              evidence: { url, hostname: hostForChecks },
            })
          );
        }

        if (isIPv4(rawHostForIp) || isIPv6(rawHostForIp)) {
          signals.push(
            this.createSignal({
              signalType: 'numeric_ip_hostname',
              severity: 'high',
              confidence: 0.78,
              description: 'URL host is a numeric IP address instead of a domain name',
              evidence: { url, hostname: hostForChecks },
            })
          );
        }

        const labels = hostForChecks.split('.').filter(Boolean);
        const hyphenCount = (hostForChecks.match(/-/g) || []).length;
        const nonAscii = /[^\u0020-\u007E]/.test(hostname);
        const unusualPort =
          urlObj.port !== '' &&
          urlObj.port !== '80' &&
          urlObj.port !== '443' &&
          urlObj.port !== '8080';

        if (labels.length >= 6 || hyphenCount >= 4 || nonAscii || unusualPort) {
          const reasons: string[] = [];
          if (labels.length >= 6) reasons.push('deep_subdomain_chain');
          if (hyphenCount >= 4) reasons.push('many_hyphens');
          if (nonAscii) reasons.push('non_ascii_hostname');
          if (unusualPort) reasons.push('nonstandard_port');

          signals.push(
            this.createSignal({
              signalType: 'suspicious_hostname_structure',
              severity: 'medium',
              confidence: 0.62,
              description: 'Hostname or port shows structural patterns common in phishing URLs',
              evidence: { url, hostname: hostForChecks, reasons, port: urlObj.port || undefined },
            })
          );
        }

        // Analyze hostname entropy
        const hostnameEntropy = this.calculateEntropy(hostname);
        if (hostnameEntropy > HIGH_ENTROPY_THRESHOLD && hostname.length >= MIN_URL_LENGTH) {
          signals.push(
            this.createSignal({
              signalType: 'high_entropy_url',
              severity: 'medium',
              confidence: Math.min(0.9, (hostnameEntropy - HIGH_ENTROPY_THRESHOLD) / 2),
              description: 'URL contains random-looking characters that might be hiding its destination',
              evidence: {
                url,
                hostname,
                entropy: hostnameEntropy,
                threshold: HIGH_ENTROPY_THRESHOLD,
              },
            })
          );
        }

        // Analyze pathname entropy (often used in phishing links)
        if (pathname.length > MIN_URL_LENGTH) {
          const pathnameEntropy = this.calculateEntropy(pathname);
          if (pathnameEntropy > HIGH_ENTROPY_THRESHOLD + 0.5) {
            signals.push(
              this.createSignal({
                signalType: 'high_entropy_url',
                severity: 'low',
                confidence: Math.min(0.8, (pathnameEntropy - HIGH_ENTROPY_THRESHOLD) / 2),
                description: 'URL path contains suspicious random characters',
                evidence: {
                  url,
                  pathname,
                  entropy: pathnameEntropy,
                  threshold: HIGH_ENTROPY_THRESHOLD,
                },
              })
            );
          }
        }

        // Check for suspicious TLDs
        const tld = hostname.split('.').pop();
        if (tld && this.isSuspiciousTld(tld)) {
          signals.push(
            this.createSignal({
              signalType: 'suspicious_tld',
              severity: 'low',
              confidence: 0.6,
              description: `URL uses a suspicious top-level domain (.${tld}) commonly used in phishing`,
              evidence: {
                url,
                tld,
              },
            })
          );
        }

        // Check for URL shorteners
        if (this.isUrlShortener(hostname)) {
          signals.push(
            this.createSignal({
              signalType: 'url_shortener',
              severity: 'low',
              confidence: 0.7,
              description: 'URL uses a link shortening service that hides the final destination',
              evidence: {
                url,
                hostname,
              },
            })
          );
        }

        // Check if HTTPS is missing
        if (urlObj.protocol === 'http:') {
          signals.push(
            this.createSignal({
              signalType: 'https_missing',
              severity: 'medium',
              confidence: 0.5,
              description: 'URL does not use secure HTTPS connection',
              evidence: {
                url,
                protocol: urlObj.protocol,
              },
            })
          );
        }
      } catch {
        // Invalid URL, skip
        continue;
      }
    }

    return signals;
  }

  /**
   * Extract URLs from input
   */
  private extractUrls(input: NormalizedInput): string[] {
    if (isUrlInput(input)) {
      return [input.data.url];
    }
    if (isEmailInput(input)) {
      return input.data.parsed.urls ?? [];
    }
    return [];
  }

  /**
   * Calculate Shannon entropy of a string
   * Higher entropy indicates more randomness
   */
  private calculateEntropy(str: string): number {
    if (str.length === 0) return 0;

    const freq: Map<string, number> = new Map();

    // Calculate character frequencies
    for (const char of str.toLowerCase()) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    // Calculate entropy using Shannon's formula
    let entropy = 0;
    const len = str.length;

    for (const count of freq.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Check if TLD is commonly used in phishing
   */
  private isSuspiciousTld(tld: string): boolean {
    const suspiciousTlds = [
      'tk',
      'ml',
      'ga',
      'cf',
      'gq',
      'xyz',
      'top',
      'work',
      'click',
      'link',
      'loan',
      'bid',
      'racing',
      'review',
      'accountant',
      'date',
      'download',
      'stream',
      'win',
    ];

    return suspiciousTlds.includes(tld.toLowerCase());
  }

  /**
   * Check if hostname is a URL shortener
   */
  private isUrlShortener(hostname: string): boolean {
    const shorteners = [
      'bit.ly',
      'tinyurl.com',
      'goo.gl',
      't.co',
      'ow.ly',
      'is.gd',
      'buff.ly',
      'adf.ly',
      'bl.ink',
      'lnkd.in',
      'shorturl.at',
      'rb.gy',
      'tiny.cc',
      'cli.gs',
      'pic.gd',
      'DwarfURL.com',
      'yfrog.com',
      'migre.me',
      'ff.im',
      'tiny.pl',
      'url4.eu',
      'tr.im',
      'twit.ac',
      'su.pr',
      'twurl.nl',
      'snipurl.com',
      'short.to',
      'budurl.com',
      'ping.fm',
      'post.ly',
      'Just.as',
      'bkite.com',
      'snipr.com',
      'fic.kr',
      'loopt.us',
      'doiop.com',
      'short.ie',
      'kl.am',
      'wp.me',
      'rubyurl.com',
      'om.ly',
      'to.ly',
      'bit.do',
      'lnkd.in',
      'db.tt',
      'qr.ae',
      'adf.ly',
      'goo.gl',
      'bitly.com',
      'cur.lv',
      'tinyurl.com',
      'ow.ly',
      'bit.ly',
      'ity.im',
      'q.gs',
      'is.gd',
      'po.st',
      'bc.vc',
      'twitthis.com',
      'u.to',
      'j.mp',
      'buzurl.com',
      'cutt.us',
      'u.bb',
      'yourls.org',
      'x.co',
      'prettylinkpro.com',
      'scrnch.me',
      'filoops.info',
      'vzturl.com',
      'qr.net',
      '1url.com',
      'tweez.me',
      'v.gd',
      '7.ly',
      'ssl.gs',
      'virl.com',
    ];

    return shorteners.some((shortener) => hostname.toLowerCase() === shortener.toLowerCase());
  }
}
