/**
 * PhishTank Client
 * Checks URLs against PhishTank phishing database
 * Free service - API key optional but recommended
 */

import axios, { type AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { getLogger } from '../logging/index.js';

const logger = getLogger();

export interface PhishTankResult {
  found: boolean;
  phishing: boolean;
  verified: boolean;
  submittedAt?: string;
  verifiedAt?: string;
  target?: string;
}

export class PhishTankClient {
  private client: AxiosInstance;
  private readonly baseURL = 'https://checkurl.phishtank.com/checkurl/';
  private readonly timeout = 5000; // 5 seconds
  private readonly apiKey?: string;

  constructor() {
    this.apiKey = process.env['PHISHTANK_API_KEY'];

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'User-Agent': 'PhishLogic/1.0',
      },
    });

    if (!this.apiKey) {
      logger.info('PhishTank API key not configured - using public API (rate limited)');
    }
  }

  /**
   * Check if URL is in PhishTank phishing database
   */
  async checkUrl(url: string): Promise<PhishTankResult> {
    try {
      // Encode URL for PhishTank API
      const encodedUrl = encodeURIComponent(url);

      // Build request parameters
      const params = new URLSearchParams({
        url: encodedUrl,
        format: 'json',
      });

      if (this.apiKey) {
        params.append('app_key', this.apiKey);
      }

      // PhishTank expects POST request
      const response = await this.client.post<any>('', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const data = response.data;

      // Check if URL is in PhishTank database
      if (data.results && data.results.in_database) {
        logger.debug({
          msg: 'URL found in PhishTank database',
          url,
          verified: data.results.verified,
          valid: data.results.valid,
        });

        return {
          found: true,
          phishing: data.results.valid === true,
          verified: data.results.verified === true,
          submittedAt: data.results.submission_time,
          verifiedAt: data.results.verification_time,
          target: data.results.target,
        };
      }

      // URL not in database (good)
      return {
        found: false,
        phishing: false,
        verified: false,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Handle rate limiting (509)
        if (error.response?.status === 509) {
          logger.warn({
            msg: 'PhishTank rate limit exceeded - consider adding API key',
            url,
          });
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          logger.warn({
            msg: 'PhishTank API timeout',
            url,
            timeout: this.timeout,
          });
        } else {
          logger.warn({
            msg: 'PhishTank API error',
            url,
            status: error.response?.status,
            error: error.message,
          });
        }
      } else {
        logger.error({
          msg: 'Unexpected PhishTank error',
          url,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Fail open - don't block URLs if service is down
      return {
        found: false,
        phishing: false,
        verified: false,
      };
    }
  }

  /**
   * Check multiple URLs in parallel
   * Note: Be careful with rate limits when checking many URLs
   */
  async checkUrls(urls: string[]): Promise<Map<string, PhishTankResult>> {
    const results = new Map<string, PhishTankResult>();

    // PhishTank has strict rate limits (1 req/5s without API key)
    // Check URLs sequentially to avoid rate limiting
    for (const url of urls) {
      try {
        const result = await this.checkUrl(url);
        results.set(url, result);

        // Add small delay between requests to respect rate limits
        if (!this.apiKey && urls.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay
        }
      } catch (error) {
        logger.warn({
          msg: 'PhishTank check failed for URL',
          url,
          error: error instanceof Error ? error.message : String(error),
        });

        results.set(url, {
          found: false,
          phishing: false,
          verified: false,
        });
      }
    }

    return results;
  }

  /**
   * Generate cache key for PhishTank result
   */
  static getCacheKey(url: string): string {
    const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
    return `phishtank:${hash}`;
  }
}
