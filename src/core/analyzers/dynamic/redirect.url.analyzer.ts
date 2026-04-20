/**
 * RedirectUrlAnalyzer — URL-task specialization of RedirectAnalyzer.
 *
 * Differences from the base (email) behavior:
 *   1. Multi-hop shortener resolver: when the target URL is a known
 *      shortener, resolve up to MAX_SHORTENER_HOPS via the shared
 *      browser pool. Emit `suspicious_redirect` per hop and
 *      `shortener_chain_detected` when 2+ hops are traversed.
 *   2. Known-domain redirect/script downgrade: if the final URL is a
 *      known-safe host, suspicious_redirect / script_execution_detected
 *      signals are demoted. automatic_download_detected stays untouched.
 *   3. QR code detection on rendered page: after the base analysis
 *      navigates the page, take a screenshot and attempt jsQR decode.
 *      Emit `qrcode_in_page` if a QR code containing a URL is found.
 */
import { getBrowserPool } from '../../../infrastructure/browser/browser-pool.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import type { AnalysisSignal, SignalSeverity } from '../../models/analysis-result.js';
import type { ContentPrescanMode } from '../../models/content-prescan.js';
import type { NormalizedInput } from '../../models/input.js';
import { isUrlInput } from '../../models/input.js';
import { getKnownDomainPolicy } from '../../policies/known-domain.policy.js';
import { RedirectAnalyzer } from './redirect.analyzer.js';

const logger = getLogger();

/** Shortener hostnames we'll resolve via Playwright. */
const KNOWN_SHORTENERS = new Set<string>([
  'bit.ly',
  't.co',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'rebrand.ly',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
  'tiny.cc',
  // Expanded set
  'lnkd.in',
  'youtu.be',
  'amzn.to',
  'fb.me',
  'shor.by',
  'v.gd',
  'dlvr.it',
  'snip.ly',
  'clk.sh',
  'short.io',
  'qr.ae',
  'trib.al',
  'zpr.io',
  'hubs.la',
  'dub.sh',
  'surl.li',
  'n9.cl',
]);

const RESOLVE_TIMEOUT_MS = 4000;
const MAX_SHORTENER_HOPS = 3;

function downgrade(severity: SignalSeverity): SignalSeverity {
  switch (severity) {
    case 'critical': return 'medium';
    case 'high': return 'low';
    case 'medium': return 'low';
    default: return severity;
  }
}

function extractHost(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Suspicious TLDs for QR URL escalation. */
const QR_SUSPICIOUS_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'work', 'click', 'link',
]);

export class RedirectUrlAnalyzer extends RedirectAnalyzer {
  override getName(): string {
    return 'RedirectAnalyzer';
  }

  getSupportedPrescanModes(): ContentPrescanMode[] {
    return ['url'];
  }

  override async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    if (!isUrlInput(input)) return super.analyze(input);

    // Skip browser navigation when prescan already failed (domain unreachable)
    const fetchError = (input.riskProfile as any)?.urlFetch?.fetchError;
    if (fetchError) {
      logger.info({
        msg: 'RedirectUrlAnalyzer: skipping — prescan navigation already failed',
        url: input.data.url,
        fetchError,
      });
      return [];
    }

    const signals = await super.analyze(input);

    const url = input.data.url;
    const policy = getKnownDomainPolicy();
    const host = extractHost(url);

    // ── Multi-hop shortener resolution ────────────────────────────────
    if (host && KNOWN_SHORTENERS.has(host)) {
      const hops = await this.resolveShortenerChain(url);

      if (hops.length > 0) {
        const lastHop = hops[hops.length - 1]!;
        const resolvedHost = extractHost(lastHop.resolvedTo);
        const targetIsKnownSafe = lastHop.resolvedTo
          ? policy.isKnownSafeHost(lastHop.resolvedTo)
          : false;

        // Emit redirect signal for the resolved destination
        signals.push(
          this.createSignal({
            signalType: 'suspicious_redirect',
            severity: targetIsKnownSafe ? 'low' : 'medium',
            confidence: 0.75,
            description: `Shortener '${host}' resolved to '${resolvedHost ?? lastHop.resolvedTo}' (${hops.length} hop${hops.length === 1 ? '' : 's'})`,
            evidence: {
              shortener: host,
              sourceUrl: url,
              resolvedUrl: lastHop.resolvedTo,
              resolvedHost,
              targetKnownSafe: targetIsKnownSafe,
              hops: hops.map((h) => ({
                url: h.url,
                resolvedTo: h.resolvedTo,
                durationMs: h.durationMs,
              })),
            },
          })
        );

        // Multi-hop chain signal (2+ hops = higher suspicion)
        if (hops.length >= 2) {
          signals.push(
            this.createSignal({
              signalType: 'shortener_chain_detected',
              severity: 'medium',
              confidence: Math.min(0.9, 0.6 + hops.length * 0.1),
              description: `URL passes through ${hops.length} shortener hops before reaching destination`,
              evidence: {
                hopCount: hops.length,
                chain: hops.map((h) => h.url),
                finalDestination: lastHop.resolvedTo,
                totalDurationMs: hops.reduce((sum, h) => sum + h.durationMs, 0),
              },
            })
          );
        }
      }
    }

    // ── QR code detection on page ─────────────────────────────────────
    const qrSignal = await this.detectQrCodeOnPage(url);
    if (qrSignal) {
      signals.push(qrSignal);
    }

    // ── Known-domain downgrade for redirect / script signals ──────────
    const out: AnalysisSignal[] = [];
    for (const signal of signals) {
      // automatic_download_detected stays critical regardless of origin.
      if (signal.signalType === 'automatic_download_detected') {
        out.push(signal);
        continue;
      }

      if (
        (signal.signalType === 'suspicious_redirect' ||
          signal.signalType === 'script_execution_detected') &&
        policy.isKnownSafeHost(url)
      ) {
        logger.debug({
          msg: 'RedirectUrlAnalyzer: downgrading signal for known-safe host',
          url,
          signalType: signal.signalType,
          originalSeverity: signal.severity,
        });
        const newSev = downgrade(signal.severity);
        out.push({
          ...signal,
          severity: newSev,
          description: `${signal.description} (downgraded: host is in Tranco top-1M known domains)`,
          evidence: {
            ...signal.evidence,
            contextDowngraded: true,
            originalSeverity: signal.severity,
            downgradeReason: 'host is in Tranco top-1M known domains',
          },
        });
        continue;
      }

      out.push(signal);
    }

    logger.info({
      msg: 'RedirectUrlAnalyzer completed',
      url,
      baseSignalCount: signals.length,
      finalSignalCount: out.length,
    });

    return out;
  }

  // ════════════════════════════════════════════════════════════════════
  // MULTI-HOP SHORTENER RESOLUTION
  // ════════════════════════════════════════════════════════════════════

  /**
   * Resolve a shortener chain up to MAX_SHORTENER_HOPS. Each hop uses the
   * shared browser pool with its own per-hop timeout.
   */
  private async resolveShortenerChain(
    startUrl: string
  ): Promise<Array<{ url: string; resolvedTo: string; durationMs: number }>> {
    const hops: Array<{ url: string; resolvedTo: string; durationMs: number }> = [];
    let currentUrl = startUrl;

    for (let i = 0; i < MAX_SHORTENER_HOPS; i++) {
      const currentHost = extractHost(currentUrl);
      if (!currentHost || !KNOWN_SHORTENERS.has(currentHost)) break;

      const start = Date.now();
      const resolved = await this.resolveSingleHop(currentUrl);
      const durationMs = Date.now() - start;

      if (!resolved || resolved === currentUrl) break;

      hops.push({ url: currentUrl, resolvedTo: resolved, durationMs });
      logger.info({
        msg: `Shortener hop ${i + 1} resolved`,
        from: currentUrl,
        to: resolved,
        durationMs,
      });

      currentUrl = resolved;
    }

    return hops;
  }

  /**
   * Resolve a single shortener hop via Playwright navigation.
   */
  private async resolveSingleHop(url: string): Promise<string | null> {
    const pool = getBrowserPool();
    const acquired = await pool.acquirePage('RedirectUrlAnalyzer.shortener');
    const { page, release } = acquired;

    try {
      const response = await page.goto(url, {
        timeout: RESOLVE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });
      return response?.url() ?? page.url();
    } catch (err) {
      logger.warn({
        msg: 'Shortener hop resolution failed',
        sourceUrl: url,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      await release();
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // QR CODE DETECTION ON RENDERED PAGE
  // ════════════════════════════════════════════════════════════════════

  /**
   * Take a screenshot of the page and attempt QR code decoding.
   * Uses the shared browser pool to navigate, capture, and decode.
   * Returns a signal if a QR code containing a URL is found.
   */
  private async detectQrCodeOnPage(url: string): Promise<AnalysisSignal | null> {
    const start = Date.now();
    const pool = getBrowserPool();
    let acquired;

    try {
      acquired = await pool.acquirePage('RedirectUrlAnalyzer.qrDetect');
    } catch (err) {
      logger.debug({
        msg: 'QR detection: failed to acquire page',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    const { page, release } = acquired;

    try {
      await page.goto(url, {
        timeout: RESOLVE_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      });

      // Take screenshot as PNG buffer
      const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });

      // Lazy-load sharp and jsQR (heavy dependencies)
      let sharp: typeof import('sharp');
      let jsQR: typeof import('jsqr');
      try {
        sharp = (await import('sharp')).default as any;
        jsQR = (await import('jsqr')).default as any;
      } catch {
        logger.debug({ msg: 'QR detection: sharp or jsQR not available' });
        return null;
      }

      // Convert to raw pixel data
      const image = sharp(screenshotBuffer);
      const metadata = await image.metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;

      if (width === 0 || height === 0) return null;

      const rawPixels = await image.ensureAlpha().raw().toBuffer();
      const qrResult = (jsQR as any)(new Uint8ClampedArray(rawPixels), width, height);

      const durationMs = Date.now() - start;

      if (!qrResult?.data) {
        logger.debug({ msg: 'QR detection: no QR code found on page', url, durationMs });
        return null;
      }

      const qrContent = qrResult.data;
      const isUrl = /^https?:\/\//i.test(qrContent);

      if (!isUrl) {
        logger.debug({ msg: 'QR detection: QR code found but content is not a URL', url, qrContent });
        return null;
      }

      // Determine severity based on QR URL characteristics
      const qrHost = extractHost(qrContent);
      const policy = getKnownDomainPolicy();
      const qrIsKnownSafe = qrContent ? policy.isKnownSafeHost(qrContent) : false;
      const qrTld = qrHost?.split('.').pop() ?? '';
      const isShortener = qrHost ? KNOWN_SHORTENERS.has(qrHost) : false;
      const isSuspiciousTld = QR_SUSPICIOUS_TLDS.has(qrTld);
      const isHttp = qrContent.startsWith('http://');

      let severity: SignalSeverity = 'medium';
      let confidence = 0.7;

      if (!qrIsKnownSafe && (isSuspiciousTld || isShortener || isHttp)) {
        severity = 'high';
        confidence = 0.8;
      } else if (qrIsKnownSafe) {
        severity = 'low';
        confidence = 0.5;
      }

      logger.info({
        msg: 'QR detection: QR code with URL found on page',
        pageUrl: url,
        qrUrl: qrContent,
        qrHost,
        qrIsKnownSafe,
        severity,
        durationMs,
      });

      return this.createSignal({
        signalType: 'qrcode_in_page',
        severity,
        confidence,
        description: `QR code on page contains URL: ${qrContent}`,
        evidence: {
          pageUrl: url,
          qrUrl: qrContent,
          qrHost,
          qrIsKnownSafe,
          isSuspiciousTld,
          isShortener,
          isHttp,
          durationMs,
        },
      });
    } catch (err) {
      logger.debug({
        msg: 'QR detection: failed',
        url,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
      return null;
    } finally {
      await release();
    }
  }
}
