/**
 * URL Playwright Fetch Extractor
 *
 * Navigates to the target URL in a shared headless chromium instance and
 * records a structured snapshot of what a real browser would see:
 *   - finalUrl (after redirects)
 *   - redirectChain
 *   - HTTP status
 *   - whether the page triggered an automatic download
 *   - rendered HTML (length-capped)
 *   - script sources
 *   - iframe sources
 *   - presence of a password field
 *   - full HTMLStructureAnalysis (so downstream analyzers see rendered content)
 *
 * Runs only for URL inputs, and only when the caller did NOT already
 * supply a pageHtmlSnippet (that path is served by
 * UrlHtmlContextSnapshotExtractor, which is strictly SSRF-safe).
 */
import type { Route } from 'playwright';

import { getBrowserPool } from '../../../../infrastructure/browser/browser-pool.js';
import { getLogger } from '../../../../infrastructure/logging/index.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isUrlInput } from '../../../models/input.js';
import { BaseExtractor } from './base.extractor.js';
import type { HTMLStructureAnalysis } from './html-structure.extractor.js';
import { parseHtmlStructureFromString } from './parse-html-structure.js';

const logger = getLogger();

const NAV_TIMEOUT_MS = 5000;
const QUIET_PERIOD_MS = 3000;
const MAX_RENDERED_HTML_LENGTH = 80_000;

export interface UrlPlaywrightFetchResult {
  requestedUrl: string;
  finalUrl: string | null;
  status: number | null;
  redirectChain: string[];
  hasAutomaticDownload: boolean;
  renderedHtml: string;
  renderedHtmlLength: number;
  scriptSources: string[];
  iframeSources: string[];
  hasPasswordField: boolean;
  htmlStructure: HTMLStructureAnalysis;
  imageTagCount: number;
  fetchError: string | null;
}

export class UrlPlaywrightFetchExtractor extends BaseExtractor<UrlPlaywrightFetchResult> {
  getName(): string {
    return 'UrlPlaywrightFetchExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    if (!isUrlInput(input)) return false;
    const snippet = input.data.context?.pageHtmlSnippet;
    if (typeof snippet === 'string' && snippet.trim().length > 0) {
      return false;
    }
    const url = input.data.url;
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  getEmptyData(): UrlPlaywrightFetchResult {
    return {
      requestedUrl: '',
      finalUrl: null,
      status: null,
      redirectChain: [],
      hasAutomaticDownload: false,
      renderedHtml: '',
      renderedHtmlLength: 0,
      scriptSources: [],
      iframeSources: [],
      hasPasswordField: false,
      htmlStructure: parseHtmlStructureFromString(''),
      imageTagCount: 0,
      fetchError: null,
    };
  }

  protected async extractData(input: NormalizedInput): Promise<UrlPlaywrightFetchResult> {
    if (!isUrlInput(input)) {
      return this.getEmptyData();
    }
    const requestedUrl = input.data.url;
    const navStart = Date.now();

    const pool = getBrowserPool();
    const acquired = await pool.acquirePage('UrlPlaywrightFetchExtractor');
    const { page, context, release } = acquired;

    const redirectChain: string[] = [];
    let hasAutomaticDownload = false;
    let finalUrl: string | null = null;
    let status: number | null = null;
    let fetchError: string | null = null;

    // Capture redirects on the main frame.
    page.on('request', (req) => {
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        redirectChain.push(req.url());
      }
    });

    // Intercept any download triggered by the page and flag it.
    context.on('page', (p) => {
      p.on('download', () => {
        hasAutomaticDownload = true;
      });
    });
    page.on('download', () => {
      hasAutomaticDownload = true;
    });

    // Intercept Content-Disposition attachments that trigger browser downloads.
    await context.route('**/*', async (route: Route) => {
      try {
        await route.continue();
      } catch {
        /* route may already have been fulfilled */
      }
    });

    try {
      const response = await page.goto(requestedUrl, {
        timeout: NAV_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      status = response?.status() ?? null;
      finalUrl = page.url();

      // Quiet period: let late-firing scripts run briefly.
      await page.waitForTimeout(QUIET_PERIOD_MS).catch(() => undefined);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      logger.debug({
        msg: 'UrlPlaywrightFetchExtractor: navigation error',
        url: requestedUrl,
        error: fetchError,
        durationMs: Date.now() - navStart,
      });
    }

    let renderedHtml = '';
    let scriptSources: string[] = [];
    let iframeSources: string[] = [];
    let hasPasswordField = false;
    let imageTagCount = 0;

    // Skip content introspection when navigation failed — there's nothing
    // useful on a page that never loaded, and the $$eval calls can block
    // for seconds on a dead connection, pushing us past the prescan timeout.
    if (!fetchError) {
      try {
        renderedHtml = await page.content();
        if (renderedHtml.length > MAX_RENDERED_HTML_LENGTH) {
          renderedHtml = renderedHtml.slice(0, MAX_RENDERED_HTML_LENGTH);
        }

        scriptSources = await page
          .$$eval('script[src]', (nodes) =>
            // Page context is DOM; cast to any to avoid pulling in DOM lib in Node build.
            nodes.map((n) => (n as unknown as { src: string }).src).filter(Boolean)
          )
          .catch(() => []);

        iframeSources = await page
          .$$eval('iframe[src]', (nodes) =>
            nodes.map((n) => (n as unknown as { src: string }).src).filter(Boolean)
          )
          .catch(() => []);

        hasPasswordField = await page
          .$$eval('input[type="password"]', (nodes) => nodes.length > 0)
          .catch(() => false);

        imageTagCount = await page.$$eval('img', (nodes) => nodes.length).catch(() => 0);
      } catch (err) {
        logger.debug({
          msg: 'UrlPlaywrightFetchExtractor: content introspection error',
          url: requestedUrl,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await release();

    const htmlStructure = parseHtmlStructureFromString(renderedHtml);

    const result: UrlPlaywrightFetchResult = {
      requestedUrl,
      finalUrl,
      status,
      redirectChain: dedupeChain(redirectChain),
      hasAutomaticDownload,
      renderedHtml,
      renderedHtmlLength: renderedHtml.length,
      scriptSources,
      iframeSources,
      hasPasswordField,
      htmlStructure,
      imageTagCount,
      fetchError,
    };

    logger.info({
      msg: 'URL Playwright fetch complete',
      requestedUrl,
      finalUrl,
      status,
      redirectHops: result.redirectChain.length,
      hasAutomaticDownload,
      hasPasswordField,
      scriptCount: scriptSources.length,
      iframeCount: iframeSources.length,
      renderedHtmlLength: renderedHtml.length,
      durationMs: Date.now() - navStart,
      fetchError,
    });

    return result;
  }
}

function dedupeChain(chain: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of chain) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
