/**
 * URLhaus Client
 * Checks URLs against URLhaus malware URL database (abuse.ch)
 * Free service - no API key required
 */

import axios, { type AxiosInstance } from 'axios';
import { getLogger } from '../logging/index.js';

const logger = getLogger();

export interface URLhausResult {
  found: boolean;
  malicious: boolean;
  threatType?: string;
  dateAdded?: string;
  reporter?: string;
  tags?: string[];
}

export class URLhausClient {
  private client: AxiosInstance;
  private readonly baseURL = 'https://urlhaus-api.abuse.ch/v1';
  private readonly timeout = 5000; // 5 seconds

  constructor() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Check if URL is in URLhaus malware database
   */
  async checkUrl(url: string): Promise<URLhausResult> {
    try {
      // URLhaus API expects POST with url parameter
      const response = await this.client.post<any>(
        '/url/',
        new URLSearchParams({ url }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const data = response.data;

      // URLhaus returns query_status: "ok" if URL is in database
      if (data.query_status === 'ok') {
        logger.debug({
          msg: 'URL found in URLhaus database',
          url,
          urlStatus: data.url_status,
          threatType: data.threat,
        });

        return {
          found: true,
          malicious: data.url_status === 'online', // online means actively serving malware
          threatType: data.threat || 'unknown',
          dateAdded: data.date_added,
          reporter: data.reporter,
          tags: data.tags || [],
        };
      }

      // query_status: "no_results" means URL not in database (good)
      if (data.query_status === 'no_results') {
        return {
          found: false,
          malicious: false,
        };
      }

      // Other statuses (invalid_url, etc.)
      logger.warn({
        msg: 'URLhaus API returned unexpected status',
        url,
        status: data.query_status,
      });

      return {
        found: false,
        malicious: false,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          logger.warn({
            msg: 'URLhaus API timeout',
            url,
            timeout: this.timeout,
          });
        } else {
          logger.warn({
            msg: 'URLhaus API error',
            url,
            status: error.response?.status,
            error: error.message,
          });
        }
      } else {
        logger.error({
          msg: 'Unexpected URLhaus error',
          url,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Fail open - don't block URLs if service is down
      return {
        found: false,
        malicious: false,
      };
    }
  }

  /**
   * Check multiple URLs in parallel
   */
  async checkUrls(urls: string[]): Promise<Map<string, URLhausResult>> {
    const results = new Map<string, URLhausResult>();

    // Check all URLs in parallel with Promise.allSettled
    const checks = await Promise.allSettled(
      urls.map(async (url) => {
        const result = await this.checkUrl(url);
        return { url, result };
      })
    );

    // Process results
    for (const check of checks) {
      if (check.status === 'fulfilled') {
        results.set(check.value.url, check.value.result);
      } else {
        logger.warn({
          msg: 'URLhaus check failed for URL',
          error: check.reason,
        });
      }
    }

    return results;
  }
}
