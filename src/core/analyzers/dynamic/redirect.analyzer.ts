/**
 * Redirect Analyzer (Dynamic)
 * Detects suspicious redirects by visiting URLs with Playwright
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput, isUrlInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { getThreatMetadata, type EnrichedThreatPattern } from '../../models/threat-metadata.js';
import { WhitelistService } from '../../services/whitelist.service.js';
import { LoginPageDetectionService } from '../../services/login-page-detection.service.js';

const logger = getLogger();

/**
 * Script Security Findings Structure
 */
interface ScriptSecurityFindings {
  inlineScriptPatterns: string[];
  externalScripts: Array<{ url: string; patterns: string[] }>;
  runtimeEvents: Array<{ type: string; detail: string; timestamp: number }>;
  domInjectionEvents: Array<{ type: string; detail: { src: string }; timestamp: number }>;
}

/**
 * Script Analysis Result with Threat Assessment
 */
interface ScriptAnalysisResult {
  hasThreats: boolean;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  findings: ScriptSecurityFindings;
  summary: {
    totalInlinePatterns: number;
    totalExternalThreats: number;
    totalRuntimeEvents: number;
    totalInjections: number;
  };
}

/**
 * Maximum number of redirects to follow
 */
const MAX_REDIRECTS = 5;

/**
 * Timeout for page navigation (milliseconds)
 */
const NAVIGATION_TIMEOUT = 10000;

/**
 * Redirect Analyzer
 */
export class RedirectAnalyzer extends BaseAnalyzer {
  private browser: Browser | null = null;
  private whitelistService: WhitelistService;
  private loginDetectionService: LoginPageDetectionService;

  constructor(
    whitelistService: WhitelistService,
    loginDetectionService: LoginPageDetectionService
  ) {
    super();
    this.whitelistService = whitelistService;
    this.loginDetectionService = loginDetectionService;
    logger.debug({ analyzer: 'RedirectAnalyzer' }, 'Initialized with dependency injection');
  }

  getName(): string {
    return 'RedirectAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.redirect; // Configurable from env (default: 1.5)
  }

  getType(): 'static' | 'dynamic' {
    return 'dynamic';
  }

  override isApplicable(input: NormalizedInput): boolean {
    // Applicable to both URL and Email inputs with URLs
    if (isUrlInput(input)) {
      return true;
    }
    if (isEmailInput(input)) {
      return (input.data.parsed.urls?.length ?? 0) > 0;
    }
    return false;
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];
    const urls = this.extractUrls(input);

    for (const url of urls) {
      try {
        const redirectInfo = await this.checkRedirects(url);

        if (redirectInfo.redirectCount > 0) {
          // Multiple redirects can be suspicious
          if (redirectInfo.redirectCount >= 3) {
            signals.push(
              this.createSignal({
                signalType: 'suspicious_redirect',
                severity: 'high',
                confidence: 0.8,
                description: `URL redirects ${redirectInfo.redirectCount} times before reaching final destination - may be hiding malicious site`,
                evidence: {
                  originalUrl: url,
                  finalUrl: redirectInfo.finalUrl,
                  redirectCount: redirectInfo.redirectCount,
                  redirectChain: redirectInfo.redirectChain,
                },
              })
            );
          } else if (redirectInfo.redirectCount > 0) {
            signals.push(
              this.createSignal({
                signalType: 'suspicious_redirect',
                severity: 'medium',
                confidence: 0.6,
                description: `URL redirects ${redirectInfo.redirectCount} time(s) to another site`,
                evidence: {
                  originalUrl: url,
                  finalUrl: redirectInfo.finalUrl,
                  redirectCount: redirectInfo.redirectCount,
                  redirectChain: redirectInfo.redirectChain,
                },
              })
            );
          }

          // Check if final domain differs from original
          if (redirectInfo.domainChanged) {
            signals.push(
              this.createSignal({
                signalType: 'suspicious_redirect',
                severity: 'medium',
                confidence: 0.7,
                description: 'URL redirects to a different domain than the one shown',
                evidence: {
                  originalUrl: url,
                  originalDomain: redirectInfo.originalDomain,
                  finalUrl: redirectInfo.finalUrl,
                  finalDomain: redirectInfo.finalDomain,
                },
              })
            );
          }
        }

        // Check for malicious behaviors (drive-by downloads, script execution, etc.)
        const maliciousBehaviors = await this.detectMaliciousBehaviors(url);

        // Automatic downloads detected
        if (maliciousBehaviors.automaticDownload) {
          signals.push(
            this.createSignal({
              signalType: 'automatic_download_detected',
              severity: 'critical',
              confidence: 0.95,
              description:
                'Page attempts automatic file download without user interaction',
              evidence: {
                url,
                downloadUrl: maliciousBehaviors.downloadUrl,
                fileName: maliciousBehaviors.fileName,
              },
            })
          );
        }

        // Script execution detected
        if (maliciousBehaviors.scriptExecution && maliciousBehaviors.scriptAnalysis) {
          const analysis = maliciousBehaviors.scriptAnalysis;

          signals.push(
            this.createSignal({
              signalType: 'script_execution_detected',
              severity: analysis.threatLevel === 'critical' ? 'critical' :
                        analysis.threatLevel === 'high' ? 'critical' : 'high',
              confidence: 0.9,
              description: `Page contains ${analysis.summary.totalInlinePatterns} suspicious inline patterns, ${analysis.summary.totalExternalThreats} external threats, ${analysis.summary.totalRuntimeEvents} runtime events, and ${analysis.summary.totalInjections} DOM injections`,
              evidence: {
                url,
                threatLevel: analysis.threatLevel,
                summary: analysis.summary,

                // NEW: Include enriched threat details with metadata for UI display
                enrichedThreats: (analysis.findings as any).enrichedThreats,

                // Include skip metadata if JS scan was skipped
                skipMetadata: maliciousBehaviors.skipMetadata,

                // NEW: Include login page context if detected (for verdict downgrade)
                loginPageContext: (analysis.findings as any).loginPageContext,

                // Legacy fields (backward compatibility)
                inlinePatterns: analysis.findings.inlineScriptPatterns,
                externalScripts: analysis.findings.externalScripts.slice(0, 20), // Limit to 20
                runtimeEvents: analysis.findings.runtimeEvents.slice(0, 10), // Limit to first 10
                domInjections: analysis.findings.domInjectionEvents.slice(0, 10)
              },
            })
          );
        }

        // JS scan was skipped - add informational signal
        if (maliciousBehaviors.skipMetadata?.skipped) {
          signals.push(
            this.createSignal({
              signalType: 'js_scan_skipped',
              severity: 'low',
              confidence: 1.0,
              description: `JavaScript security scan was skipped: ${maliciousBehaviors.skipMetadata.reason}`,
              evidence: {
                url,
                skipped: true,
                reason: maliciousBehaviors.skipMetadata.reason,
                timeSaved: '~2000-3000ms',
                explanation: 'JS scan was safely skipped due to trusted domain and login page detection. No threats expected in this scenario.'
              },
            })
          );
        }

        // Installation prompt detected
        if (maliciousBehaviors.installationPrompt) {
          signals.push(
            this.createSignal({
              signalType: 'installation_prompt_detected',
              severity: 'high',
              confidence: 0.85,
              description: 'Page prompts for software installation',
              evidence: {
                url,
                promptText: maliciousBehaviors.promptText,
              },
            })
          );
        }
      } catch (error) {
        logger.warn({
          msg: 'Failed to check redirects',
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next URL
      }
    }

    return signals;
  }

  /**
   * Check redirects for a URL
   */
  private async checkRedirects(url: string): Promise<{
    redirectCount: number;
    finalUrl: string;
    redirectChain: string[];
    originalDomain: string;
    finalDomain: string;
    domainChanged: boolean;
  }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const redirectChain: string[] = [url];
    let redirectCount = 0;

    try {
      // Track navigation events
      page.on('response', (response) => {
        const status = response.status();
        if (status >= 300 && status < 400) {
          redirectCount++;
          const location = response.headers()['location'];
          if (location && redirectCount < MAX_REDIRECTS) {
            redirectChain.push(location);
          }
        }
      });

      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      });

      const finalUrl = page.url();
      redirectChain.push(finalUrl);

      const originalDomain = this.extractDomain(url);
      const finalDomain = this.extractDomain(finalUrl);
      const domainChanged = originalDomain !== finalDomain;

      return {
        redirectCount,
        finalUrl,
        redirectChain,
        originalDomain,
        finalDomain,
        domainChanged,
      };
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /**
   * Extract page content for login detection
   * Lightweight extraction (~50ms) to enable smart skip optimization
   */
  private async extractPageContentForLoginDetection(page: Page): Promise<{
    bodyText: string;
    title: string;
    buttons: string[];
    links: string[];
    headings: string[];
    formFields: { hasPassword: boolean; hasEmail: boolean; hasMobile: boolean };
  }> {
    try {
      const content = await page.evaluate(`
        (() => {
          // Extract visible text
          const bodyText = document.body?.textContent || '';

          // Extract title
          const title = document.title || '';

          // Extract button text
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'))
            .map(btn => btn.textContent || btn.value || '')
            .filter(text => text.trim().length > 0);

          // Extract link text
          const links = Array.from(document.querySelectorAll('a'))
            .map(link => link.textContent || '')
            .filter(text => text.trim().length > 0);

          // Extract headings
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .map(heading => heading.textContent || '')
            .filter(text => text.trim().length > 0);

          // Detect form fields
          const hasPassword = document.querySelector('input[type="password"]') !== null;
          const hasEmail = document.querySelector('input[type="email"], input[name*="email"]') !== null;
          const hasMobile = document.querySelector('input[type="tel"], input[name*="phone"], input[name*="mobile"]') !== null;

          return {
            bodyText: bodyText.substring(0, 5000), // Limit to first 5000 chars
            title,
            buttons: buttons.slice(0, 20), // Limit arrays
            links: links.slice(0, 20),
            headings: headings.slice(0, 10),
            formFields: { hasPassword, hasEmail, hasMobile }
          };
        })()
      `) as {
        bodyText: string;
        title: string;
        buttons: string[];
        links: string[];
        headings: string[];
        formFields: { hasPassword: boolean; hasEmail: boolean; hasMobile: boolean };
      };

      return content;
    } catch (error) {
      logger.warn({
        msg: 'Failed to extract page content for login detection',
        error: error instanceof Error ? error.message : String(error)
      });

      // Return empty content on error (will not skip scan)
      return {
        bodyText: '',
        title: '',
        buttons: [],
        links: [],
        headings: [],
        formFields: { hasPassword: false, hasEmail: false, hasMobile: false }
      };
    }
  }

  /**
   * Check if domain has a legitimate TLD (basic trust indicator)
   * Simple check for common trusted TLDs - not comprehensive verification
   */
  private isLegitimateDomain(domain: string): boolean {
    const legitimateTLDs = [
      '.com', '.org', '.net', '.edu', '.gov', '.mil',
      '.bank', '.insurance', '.financial',
      '.co.uk', '.co.in', '.co.jp', '.com.au'
    ];

    return legitimateTLDs.some(tld => domain.endsWith(tld));
  }

  /**
   * Determine if JavaScript security scan should be skipped for this URL
   *
   * Skip condition: (Domain is whitelisted OR Domain is legitimate) AND Page is login page
   *
   * Both conditions must be true:
   * 1. Domain is trusted (whitelisted OR has legitimate TLD)
   * 2. Page is a login page
   *
   * @returns true if safe to skip, false if scan should run
   */
  private async shouldSkipJSScan(url: string, page: Page): Promise<{
    shouldSkip: boolean;
    reason?: string;
  }> {
    const skipCheckStart = Date.now();

    try {
      const domain = this.extractDomain(url);
      if (!domain) {
        return { shouldSkip: false };
      }

      // Step 1: Check if domain is trusted (whitelisted OR legitimate)
      // Create a simple URL input to check whitelist
      const urlInput: NormalizedInput = {
        type: 'url',
        id: `temp-${Date.now()}`,
        timestamp: new Date(),
        data: { url }
      };
      const whitelistResult = await this.whitelistService.check(urlInput);
      const isWhitelisted = whitelistResult.isWhitelisted;
      const isLegitimate = this.isLegitimateDomain(domain);
      const isTrustedDomain = isWhitelisted || isLegitimate;

      if (!isTrustedDomain) {
        // Domain is not trusted - proceed with full scan
        logger.debug({
          msg: 'JS scan will proceed - domain not trusted',
          url,
          domain,
          isWhitelisted: false,
          isLegitimate: false,
          checkDuration: Date.now() - skipCheckStart
        });
        return { shouldSkip: false };
      }

      // Step 2: Check if page is a login page
      const pageContent = await this.extractPageContentForLoginDetection(page);
      const loginDetection = this.loginDetectionService.detectLoginPage(pageContent);

      if (!loginDetection.isLoginPage) {
        // Not a login page - proceed with full scan
        logger.debug({
          msg: 'JS scan will proceed - not a login page',
          url,
          domain,
          isWhitelisted,
          isLegitimate,
          loginConfidence: loginDetection.confidence,
          checkDuration: Date.now() - skipCheckStart
        });
        return { shouldSkip: false };
      }

      // BOTH conditions met: (whitelisted OR legitimate) AND login → SKIP
      const trustReason = isWhitelisted
        ? `whitelisted (${whitelistResult.matchReason})`
        : `legitimate TLD`;

      logger.info({
        msg: 'Skipping JS scan - trusted domain with login page',
        url,
        domain,
        trustReason,
        isWhitelisted,
        isLegitimate,
        loginConfidence: loginDetection.confidence,
        keywords: loginDetection.evidence.keywords,
        oauthProviders: loginDetection.evidence.oauthProviders,
        checkDuration: Date.now() - skipCheckStart
      });

      return {
        shouldSkip: true,
        reason: `Trusted domain (${trustReason}) with login page (confidence: ${(loginDetection.confidence * 100).toFixed(0)}%)`
      };

    } catch (error) {
      // On error, default to NOT skipping (safe fallback - no false negatives)
      logger.warn({
        msg: 'Skip check failed - defaulting to full scan',
        url,
        error: error instanceof Error ? error.message : String(error),
        checkDuration: Date.now() - skipCheckStart
      });

      return { shouldSkip: false };
    }
  }

  /**
   * Detect malicious behaviors on the page
   */
  private async detectMaliciousBehaviors(url: string): Promise<{
    automaticDownload: boolean;
    downloadUrl?: string;
    fileName?: string;
    scriptExecution: boolean;
    scriptAnalysis?: ScriptAnalysisResult;
    installationPrompt: boolean;
    promptText?: string;
    suspiciousJavaScript: boolean;
    skipMetadata?: { skipped: boolean; reason?: string };
    /**
     * @deprecated Use scriptAnalysis.findings instead for detailed threat information
     * This field maps to legacy format for backward compatibility and will be removed in v3.0
     */
    jsPatterns?: string[];
  }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const result = {
      automaticDownload: false,
      scriptExecution: false,
      installationPrompt: false,
      suspiciousJavaScript: false,
    };

    try {
      // 1️⃣ Setup security hooks BEFORE navigation (required for runtime interception)
      await this.setupSecurityHooks(page);
      logger.debug({ msg: 'Security hooks installed', url });

      // 2️⃣ Navigate to URL
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      });
      logger.debug({ msg: 'Page navigation completed', url });

      // 3️⃣ Smart Skip Optimization - Check if JS scan can be safely skipped
      const skipCheck = await this.shouldSkipJSScan(url, page);
      let jsAnalysis: ScriptAnalysisResult;
      let skipMetadata: { skipped: boolean; reason?: string } | undefined;

      if (skipCheck.shouldSkip) {
        // Return empty results - no threats detected (skipped)
        logger.info({
          msg: 'JS scan skipped',
          url,
          reason: skipCheck.reason,
          timeSaved: '~2000-3000ms'
        });

        // Store skip metadata to include in signal evidence
        skipMetadata = {
          skipped: true,
          reason: skipCheck.reason
        };

        jsAnalysis = {
          hasThreats: false,
          threatLevel: 'low',
          findings: {
            inlineScriptPatterns: [],
            externalScripts: [],
            runtimeEvents: [],
            domInjectionEvents: []
          },
          summary: {
            totalInlinePatterns: 0,
            totalExternalThreats: 0,
            totalRuntimeEvents: 0,
            totalInjections: 0
          }
        };
      } else {
        // Proceed with full JS security scan
        jsAnalysis = await this.scanPageForJSRisks(page, url);
      }

      // 1. Check for automatic downloads (KEEP - not redundant)
      const downloadAttempted = (await page.evaluate(`
        (() => {
          const downloadLinks = document.querySelectorAll('a[download]');
          if (downloadLinks.length > 0) {
            return {
              detected: true,
              url: downloadLinks[0].href,
              fileName: downloadLinks[0].download,
            };
          }

          const iframes = document.querySelectorAll('iframe[src*="download"]');
          if (iframes.length > 0) {
            return {
              detected: true,
              url: iframes[0].src,
            };
          }

          return { detected: false };
        })()
      `)) as { detected: boolean; url?: string; fileName?: string };

      if (downloadAttempted.detected) {
        result.automaticDownload = true;
        (result as any).downloadUrl = downloadAttempted.url;
        (result as any).fileName = downloadAttempted.fileName;
      }

      // 2. Use enterprise scanner results (REPLACES old script detection code)
      if (jsAnalysis.hasThreats) {
        result.scriptExecution = true;
        (result as any).scriptAnalysis = jsAnalysis;
        result.suspiciousJavaScript = jsAnalysis.threatLevel === 'high' || jsAnalysis.threatLevel === 'critical';

        // Map to legacy pattern format for backward compatibility
        const allPatterns = new Set([
          ...jsAnalysis.findings.inlineScriptPatterns,
          ...jsAnalysis.findings.externalScripts.flatMap(s => s.patterns),
          ...jsAnalysis.findings.runtimeEvents.map(e => e.type)
        ]);
        (result as any).jsPatterns = Array.from(allPatterns);
      }

      // Include skip metadata if scan was skipped
      if (skipMetadata) {
        (result as any).skipMetadata = skipMetadata;
      }

      // 3. Check for installation prompts (KEEP - not redundant)
      const installPrompt = (await page.evaluate(`
        (() => {
          const bodyText = document.body.textContent || '';
          const installKeywords = [
            'install now',
            'download and install',
            'setup.exe',
            'install plugin',
            'install extension',
            'install software',
          ];

          for (const keyword of installKeywords) {
            if (bodyText.toLowerCase().includes(keyword)) {
              return { detected: true, text: keyword };
            }
          }
          return { detected: false };
        })()
      `)) as { detected: boolean; text?: string };

      if (installPrompt.detected) {
        result.installationPrompt = true;
        (result as any).promptText = installPrompt.text;
      }

    } catch (error) {
      logger.warn({
        msg: 'Failed to detect malicious behaviors',
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
      await context.close();
    }

    return result;
  }

  /**
   * Enterprise JavaScript Security Scanner
   * Collects security findings from inline scripts, external scripts, and runtime events
   * NOTE: setupSecurityHooks() MUST be called before navigation for runtime tracking
   */
  private async scanPageForJSRisks(page: Page, url: string): Promise<ScriptAnalysisResult> {
    logger.info({ msg: 'Collecting JS security scan results', url });

    const findings: ScriptSecurityFindings = {
      inlineScriptPatterns: [],
      externalScripts: [],
      runtimeEvents: [],
      domInjectionEvents: []
    };

    try {
      // 1️⃣ External Script Scanner (Timeout-based, not event-based)
      const externalScriptPromise = new Promise<Array<{ url: string; patterns: string[] }>>((resolve) => {
        const externalFindings: Array<{ url: string; patterns: string[] }> = [];

        page.on("response", async (response) => {
          try {
            const responseUrl = response.url();
            if (!responseUrl.endsWith(".js")) return;

            const body = await response.text();
            const detected: string[] = [];

            if (/eval\s*\(/i.test(body)) detected.push("eval_execution");
            if (/new\s+Function\s*\(/i.test(body)) detected.push("function_constructor");
            if (/document\.write/i.test(body)) detected.push("document_write");
            if (/innerHTML\s*=/i.test(body)) detected.push("innerHTML_injection");
            if (/createElement\s*\(\s*['"]script/i.test(body)) detected.push("dynamic_script_injection");
            if (/atob\s*\(/i.test(body)) detected.push("base64_obfuscation");
            if (/unescape\s*\(/i.test(body)) detected.push("unescape_obfuscation");

            if (detected.length > 0) {
              externalFindings.push({ url: responseUrl, patterns: detected });
              logger.debug({ msg: 'External script threat detected', scriptUrl: responseUrl, patterns: detected });
            }
          } catch (err) {
            logger.warn({ msg: 'Failed to analyze external script', error: err instanceof Error ? err.message : String(err) });
          }
        });

        // Use timeout instead of "load" event (fixes hanging bug)
        setTimeout(() => {
          logger.debug({ msg: 'External script scan completed', threatsFound: externalFindings.length });
          resolve(externalFindings);
        }, 2000);
      });

      // 2️⃣ Inline Script Static Analysis
      const inlineScriptPromise = page.evaluate(`
        (() => {
          const detected = new Set();
          const scripts = Array.from(document.scripts);

          scripts.forEach((script) => {
            const content = script.textContent || "";

            if (/eval\\s*\\(/i.test(content)) detected.add("eval_execution");
            if (/new\\s+Function\\s*\\(/i.test(content)) detected.add("function_constructor");
            if (/document\\.write/i.test(content)) detected.add("document_write");
            if (/innerHTML\\s*=/i.test(content)) detected.add("innerHTML_injection");
            if (/createElement\\s*\\(\\s*['"]script/i.test(content)) detected.add("dynamic_script_injection");
            if (/setTimeout\\s*\\(\\s*['"\`]/i.test(content)) detected.add("string_settimeout_execution");
            if (/setInterval\\s*\\(\\s*['"\`]/i.test(content)) detected.add("string_setinterval_execution");
            if (/atob\\s*\\(/i.test(content)) detected.add("base64_decode");
            if (/unescape\\s*\\(/i.test(content)) detected.add("unescape_obfuscation");
            if (/fetch\\s*\\(/i.test(content)) detected.add("fetch_network_request");
            if (/XMLHttpRequest/i.test(content)) detected.add("xhr_network_request");
          });

          return Array.from(detected);
        })()
      `) as Promise<string[]>;

      logger.debug({ msg: 'Inline script analysis started', url });

      // 3️⃣ Runtime Event Collector
      const timeoutMs = this.config.analysis.scriptScanTimeoutMs;
      const runtimeEventPromise = page.evaluate(`
        (() => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                runtimeEvents: window.__securityEvents || [],
                domEvents: window.__domInjectionEvents || []
              });
            }, ${timeoutMs});
          });
        })()
      `) as Promise<{ runtimeEvents: any[]; domEvents: any[] }>;

      // 4️⃣ Run All Scanners Concurrently
      const [inlinePatterns, externalScripts, runtimeData] = await Promise.all([
        inlineScriptPromise,
        externalScriptPromise,
        runtimeEventPromise
      ]);

      findings.inlineScriptPatterns = inlinePatterns;
      findings.externalScripts = externalScripts.slice(0, 20); // Limit to 20
      findings.runtimeEvents = runtimeData.runtimeEvents;
      findings.domInjectionEvents = runtimeData.domEvents;

      // Define what constitutes a SERIOUS runtime threat vs benign activity
      const SERIOUS_RUNTIME_THREATS = new Set([
        'eval_execution',
        'function_constructor',
        'document_write',
        'runtime_script_injection' // DOM injection
      ]);

      const BENIGN_RUNTIME_ACTIVITY = new Set([
        'fetch_request',
        'xhr_request'
      ]);

      const SERIOUS_INLINE_PATTERNS = new Set([
        'eval_execution',
        'function_constructor',
        'document_write',
        'innerHTML_injection',
        'dynamic_script_injection',
        'string_settimeout_execution',
        'string_setinterval_execution',
        'base64_decode',
        'unescape_obfuscation'
      ]);

      const BENIGN_INLINE_PATTERNS = new Set([
        'fetch_network_request',
        'xhr_network_request'
      ]);

      // Separate runtime events into serious threats vs benign activity
      const seriousRuntimeEvents = runtimeData.runtimeEvents.filter((e: any) =>
        SERIOUS_RUNTIME_THREATS.has(e.type)
      );
      const benignRuntimeEvents = runtimeData.runtimeEvents.filter((e: any) =>
        BENIGN_RUNTIME_ACTIVITY.has(e.type)
      );

      // Separate inline patterns into threats vs informational
      const seriousInlinePatterns = inlinePatterns.filter((p: string) =>
        SERIOUS_INLINE_PATTERNS.has(p)
      );
      const benignInlinePatterns = inlinePatterns.filter((p: string) =>
        BENIGN_INLINE_PATTERNS.has(p)
      );

      // Log detailed breakdown with SERIOUS THREATS highlighted
      if (inlinePatterns.length > 0) {
        logger.info({
          msg: 'Inline script patterns detected',
          url,
          total: inlinePatterns.length,
          seriousThreats: seriousInlinePatterns.length,
          benignActivity: benignInlinePatterns.length,
          serious: seriousInlinePatterns,
          benign: benignInlinePatterns,
        });
      }

      if (externalScripts.length > 0) {
        logger.info({
          msg: 'External script threats detected',
          url,
          count: externalScripts.length,
          scripts: externalScripts.map(s => ({
            url: s.url,
            patterns: s.patterns
          }))
        });
      }

      if (runtimeData.runtimeEvents.length > 0) {
        // Group SERIOUS and BENIGN events separately
        const seriousEventCounts: Record<string, number> = {};
        seriousRuntimeEvents.forEach((event: any) => {
          seriousEventCounts[event.type] = (seriousEventCounts[event.type] || 0) + 1;
        });

        const benignEventCounts: Record<string, number> = {};
        benignRuntimeEvents.forEach((event: any) => {
          benignEventCounts[event.type] = (benignEventCounts[event.type] || 0) + 1;
        });

        logger.info({
          msg: 'Runtime events detected',
          url,
          totalEvents: runtimeData.runtimeEvents.length,
          seriousThreats: seriousRuntimeEvents.length,
          benignActivity: benignRuntimeEvents.length,
          seriousBreakdown: seriousEventCounts,
          benignBreakdown: benignEventCounts,
        });
      }

      if (runtimeData.domEvents.length > 0) {
        logger.warn({
          msg: 'DOM injection events detected (SERIOUS THREAT)',
          url,
          count: runtimeData.domEvents.length,
          events: runtimeData.domEvents.map((e: any) => ({
            type: e.type,
            src: e.detail?.src
          }))
        });
      }

      // ===================================================================
      // THREAT ENRICHMENT: Add metadata for UI display
      // Filter out unknown threats and enrich with display names, explanations
      // ===================================================================

      // Enrich inline patterns with metadata - FILTER OUT unknown threats
      const enrichedInlineThreats: EnrichedThreatPattern[] = inlinePatterns
        .filter(patternId => {
          const metadata = getThreatMetadata(patternId);
          if (!metadata) {
            // Unknown threat - log but don't include in UI
            logger.warn({
              msg: 'Unknown inline pattern detected (not in registry)',
              patternId,
              url
            });
            return false;
          }
          return true;
        })
        .map(patternId => {
          const metadata = getThreatMetadata(patternId)!; // Safe after filter
          return {
            patternId,
            displayName: metadata.displayName,
            riskLevel: metadata.riskLevel,
            explanation: metadata.explanation,
            riskReason: metadata.riskReason,
            category: metadata.category,
            detectedIn: 'inline' as const
          };
        });

      // Enrich external script threats - FILTER OUT unknown threats
      const enrichedExternalThreats = externalScripts
        .map(script => ({
          url: script.url,
          threats: script.patterns
            .filter(patternId => {
              const metadata = getThreatMetadata(patternId);
              if (!metadata) {
                logger.warn({
                  msg: 'Unknown external script pattern detected (not in registry)',
                  patternId,
                  scriptUrl: script.url,
                  url
                });
                return false;
              }
              return true;
            })
            .map(patternId => {
              const metadata = getThreatMetadata(patternId)!;
              return {
                patternId,
                displayName: metadata.displayName,
                riskLevel: metadata.riskLevel,
                explanation: metadata.explanation,
                riskReason: metadata.riskReason,
                category: metadata.category
              };
            })
        }))
        .filter(script => script.threats.length > 0); // Remove scripts with no known threats

      // Enrich runtime events - FILTER OUT unknown threats
      const enrichedRuntimeThreats = runtimeData.runtimeEvents
        .filter((event: any) => {
          const metadata = getThreatMetadata(event.type);
          if (!metadata) {
            logger.warn({
              msg: 'Unknown runtime event type detected (not in registry)',
              eventType: event.type,
              detail: event.detail,
              url
            });
            return false;
          }
          return true;
        })
        .map((event: any) => {
          const metadata = getThreatMetadata(event.type)!;
          return {
            patternId: event.type,
            displayName: metadata.displayName,
            riskLevel: metadata.riskLevel,
            explanation: metadata.explanation,
            riskReason: metadata.riskReason,
            category: metadata.category,
            detail: event.detail,
            timestamp: event.timestamp
          };
        });

      // Enrich DOM injections (always critical)
      const enrichedDomInjections = runtimeData.domEvents.map((event: any) => {
        const metadata = getThreatMetadata('runtime_script_injection');
        return {
          patternId: 'runtime_script_injection',
          displayName: metadata?.displayName || 'Runtime Script Injection',
          riskLevel: 'critical' as const,
          explanation: metadata?.explanation || 'Dynamically injects <script> tags',
          riskReason: metadata?.riskReason || 'Allows executing external malicious scripts',
          category: 'dom_manipulation' as const,
          detail: event.detail,
          timestamp: event.timestamp
        };
      });

      // Store enriched data in findings (for signal evidence)
      (findings as any).enrichedThreats = {
        inline: enrichedInlineThreats,
        external: enrichedExternalThreats,
        runtime: enrichedRuntimeThreats,
        dom: enrichedDomInjections,
        summary: {
          criticalCount: [...enrichedInlineThreats, ...enrichedRuntimeThreats, ...enrichedDomInjections]
            .filter(t => t.riskLevel === 'critical').length,
          highCount: [...enrichedInlineThreats, ...enrichedRuntimeThreats, ...enrichedDomInjections]
            .filter(t => t.riskLevel === 'high').length,
          mediumCount: [...enrichedInlineThreats, ...enrichedRuntimeThreats, ...enrichedDomInjections]
            .filter(t => t.riskLevel === 'medium').length,
          benignCount: enrichedInlineThreats.filter(t => t.riskLevel === 'benign').length +
                       enrichedRuntimeThreats.filter(t => t.riskLevel === 'benign').length
        }
      };

      // ===================================================================
      // LOGIN PAGE CONTEXT DETECTION: Add context for verdict downgrade
      // Detect if page is a login page to provide context for threat severity
      // ===================================================================
      try {
        const pageContent = await this.extractPageContentForLoginDetection(page);
        const loginDetection = this.loginDetectionService.detectLoginPage(pageContent);

        if (loginDetection.isLoginPage && loginDetection.confidence >= 0.6) {
          (findings as any).loginPageContext = {
            isLoginPage: true,
            confidence: loginDetection.confidence,
            keywords: loginDetection.evidence.keywords,
            oauthProviders: loginDetection.evidence.oauthProviders,
            reasoning: `Login page detected (${(loginDetection.confidence * 100).toFixed(0)}% confidence) - JavaScript is expected for form validation and authentication`
          };

          logger.info({
            msg: 'Login page context added to JS scan results',
            url,
            confidence: loginDetection.confidence,
            keywords: loginDetection.evidence.keywords,
            oauthProviders: loginDetection.evidence.oauthProviders
          });
        } else if (loginDetection.confidence > 0) {
          // Log near-miss for debugging
          logger.debug({
            msg: 'Page resembles login page but confidence too low',
            url,
            confidence: loginDetection.confidence,
            threshold: 0.6
          });
        }
      } catch (error) {
        logger.warn({
          msg: 'Failed to detect login page context',
          url,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue without login context (won't downgrade severity)
      }

      // Calculate threat level using ONLY serious threats (not benign activity)
      const totalThreats =
        seriousInlinePatterns.length +  // Only serious patterns
        externalScripts.length +
        seriousRuntimeEvents.length +   // Only serious runtime events
        runtimeData.domEvents.length;   // DOM injection always serious

      logger.debug({
        msg: 'Threat calculation',
        url,
        seriousInlinePatterns: seriousInlinePatterns.length,
        externalThreats: externalScripts.length,
        seriousRuntimeEvents: seriousRuntimeEvents.length,
        domInjections: runtimeData.domEvents.length,
        totalSeriousThreats: totalThreats,
        excludedBenignEvents: benignRuntimeEvents.length,
        excludedBenignPatterns: benignInlinePatterns.length
      });

      let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

      // Check for high-risk runtime patterns (PRIORITY)
      const hasRuntimeEval = seriousRuntimeEvents.some((e: any) => e.type === 'eval_execution');
      const hasRuntimeFunction = seriousRuntimeEvents.some((e: any) => e.type === 'function_constructor');
      const hasDOMInjection = runtimeData.domEvents.length > 0;

      if (hasRuntimeEval || hasRuntimeFunction || hasDOMInjection) {
        threatLevel = 'critical'; // Active threats take priority
        logger.warn({
          msg: 'Critical runtime threat detected',
          url,
          hasRuntimeEval,
          hasRuntimeFunction,
          hasDOMInjection
        });
      } else if (totalThreats >= 10) {
        threatLevel = 'critical';
      } else if (totalThreats >= 5) {
        threatLevel = 'high';
      } else if (totalThreats >= 2) {
        threatLevel = 'medium';
      }

      // Log overall threat assessment
      if (totalThreats > 0) {
        logger.warn({
          msg: 'JavaScript threats detected',
          url,
          threatLevel,
          summary: {
            inline: inlinePatterns.length,
            external: externalScripts.length,
            runtime: runtimeData.runtimeEvents.length,
            injections: runtimeData.domEvents.length
          }
        });
      }

      logger.info({
        msg: 'JS security scan completed',
        url,
        inlinePatterns: inlinePatterns.length,
        externalThreats: externalScripts.length,
        runtimeEvents: runtimeData.runtimeEvents.length,
        domInjections: runtimeData.domEvents.length
      });

      return {
        hasThreats: totalThreats > 0,
        threatLevel,
        findings,
        summary: {
          totalInlinePatterns: inlinePatterns.length,
          totalExternalThreats: externalScripts.length,
          totalRuntimeEvents: runtimeData.runtimeEvents.length,
          totalInjections: runtimeData.domEvents.length
        }
      };

    } catch (error) {
      logger.error({
        msg: 'JS security scan failed',
        url,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return safe default on error
      return {
        hasThreats: false,
        threatLevel: 'low',
        findings,
        summary: {
          totalInlinePatterns: 0,
          totalExternalThreats: 0,
          totalRuntimeEvents: 0,
          totalInjections: 0
        }
      };
    }
  }

  /**
   * Setup runtime security hooks (MUST be called BEFORE navigation)
   * Installs interception hooks for eval(), Function(), document.write, fetch, XHR, and DOM mutations
   */
  private async setupSecurityHooks(page: Page): Promise<void> {
    await page.addInitScript(`
      window.__securityEvents = [];
      window.__domInjectionEvents = [];

      function logEvent(type, detail) {
        window.__securityEvents.push({ type, detail, timestamp: Date.now() });
      }

      function logDomEvent(type, detail) {
        window.__domInjectionEvents.push({ type, detail, timestamp: Date.now() });
      }

      // Hook eval()
      const originalEval = window.eval;
      window.eval = function (...args) {
        logEvent("eval_execution", String(args[0]).substring(0, 150));
        return originalEval.apply(this, args);
      };

      // Hook Function constructor
      const OriginalFunction = Function;
      window.Function = function (...args) {
        logEvent("function_constructor", String(args.join(" ")).substring(0, 150));
        return OriginalFunction.apply(this, args);
      };

      // Hook document.write
      const originalWrite = document.write;
      document.write = function (...args) {
        logEvent("document_write", String(args[0]).substring(0, 150));
        return originalWrite.apply(this, args);
      };

      // Hook fetch
      const originalFetch = window.fetch;
      window.fetch = function (...args) {
        logEvent("fetch_request", String(args[0]));
        return originalFetch.apply(this, args);
      };

      // Hook XMLHttpRequest
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        logEvent("xhr_request", String(url));
        return originalOpen.apply(this, arguments);
      };

      // DOM Mutation observer - detect script injection
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === "SCRIPT") {
              logDomEvent("runtime_script_injection", {
                src: node.src || "inline_script"
              });
            }
          });
        });
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    `);
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
   * Get or create browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      logger.info('Playwright browser launched for RedirectAnalyzer');
    }
    return this.browser;
  }

  /**
   * Close browser (cleanup)
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Playwright browser closed for RedirectAnalyzer');
    }
  }
}
