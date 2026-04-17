/**
 * Shared Playwright Browser Pool
 *
 * Provides a single lazy-launched chromium instance that is shared across
 * all analyzers/extractors that need a headless browser (RedirectAnalyzer,
 * FormAnalyzer, and the URL Playwright fetch extractor).
 *
 * Rationale:
 * - Avoids spawning one chromium process per analyzer.
 * - Centralizes shutdown so SIGTERM / test teardown cleanly closes the one
 *   browser instance.
 * - Every acquirePage() call creates an isolated BrowserContext so pages
 *   never share cookies / storage / service workers.
 */
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';

import { getLogger } from '../logging/index.js';

const logger = getLogger();

interface AcquiredPage {
  page: Page;
  context: BrowserContext;
  release: () => Promise<void>;
}

class BrowserPool {
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;
  private shutdownHooked = false;

  /**
   * Lazily launch a single headless chromium instance. Concurrent callers
   * share the same in-flight launch promise so we never double-launch.
   */
  async getBrowser(owner: string = 'unknown'): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (!this.launchPromise) {
      const launchStart = Date.now();
      this.launchPromise = chromium
        .launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          timeout: 45000,
        })
        .then((b) => {
          this.browser = b;
          this.launchPromise = null;
          this.installShutdownHook();
          logger.info({
            msg: 'Playwright browser launched (shared pool)',
            owner,
            launchDurationMs: Date.now() - launchStart,
          });
          return b;
        })
        .catch((err) => {
          this.launchPromise = null;
          logger.error({
            msg: 'Playwright browser launch failed',
            owner,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        });
    }

    return this.launchPromise;
  }

  /**
   * Acquire a fresh isolated page. Callers MUST call `release()` (or close
   * the returned context) when finished.
   */
  async acquirePage(owner: string = 'unknown'): Promise<AcquiredPage> {
    const browser = await this.getBrowser(owner);
    const context = await browser.newContext();
    const page = await context.newPage();
    return {
      page,
      context,
      release: async () => {
        try {
          await context.close();
        } catch (err) {
          logger.debug({
            msg: 'BrowserPool release: context.close failed',
            owner,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    };
  }

  /**
   * Close the shared browser. Safe to call multiple times.
   */
  async shutdown(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (!b) return;
    try {
      await b.close();
      logger.info({ msg: 'Playwright browser closed (shared pool)' });
    } catch (err) {
      logger.warn({
        msg: 'Playwright browser close failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private installShutdownHook(): void {
    if (this.shutdownHooked) return;
    this.shutdownHooked = true;
    const handler = () => {
      // Fire-and-forget: process is exiting anyway.
      void this.shutdown();
    };
    process.once('SIGTERM', handler);
    process.once('SIGINT', handler);
    process.once('beforeExit', handler);
  }

  /** Test-only helper. */
  isLaunched(): boolean {
    return !!this.browser && this.browser.isConnected();
  }
}

let poolInstance: BrowserPool | null = null;

export function getBrowserPool(): BrowserPool {
  if (!poolInstance) {
    poolInstance = new BrowserPool();
  }
  return poolInstance;
}

/** Test-only helper to drop the singleton (does not close any running browser). */
export function resetBrowserPool(): void {
  poolInstance = null;
}

export type { AcquiredPage };
