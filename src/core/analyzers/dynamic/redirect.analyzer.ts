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
import { getBrowserPool } from '../../../infrastructure/browser/browser-pool.js';
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
 * Redirect Analyzer
 */
export class RedirectAnalyzer extends BaseAnalyzer {
  protected browser: Browser | null = null;
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

    logger.info({
      msg: 'Starting redirect analysis',
      urlCount: urls.length,
    });

    // ============================================================
    // ORCHESTRATION: Loop through all URLs
    // ============================================================
    for (const url of urls) {
      try {
        logger.info({ msg: 'Analyzing URL', url });

        // Step 1: Extract domain
        const domain = this.extractDomain(url);
        logger.debug({ msg: 'Domain extracted', url, domain });

        // Step 2: Validate domain (whitelist/legitimate check)
        const domainValidation = await this.validateDomain(url, domain);
        logger.info({
          msg: 'Domain validation completed',
          url,
          domain,
          isWhitelisted: domainValidation.isWhitelisted,
          isLegitimate: domainValidation.isLegitimate,
        });

        // Step 3: Execute behavioral analysis
        const behaviorResult = await this.detectMaliciousBehaviors(url, domainValidation);

        // Step 4: Prepare signals based on results
        const urlSignals = await this.prepareSignals(url, behaviorResult);

        // Step 5: Add to signal collection
        signals.push(...urlSignals);

        logger.info({
          msg: 'URL analysis completed',
          url,
          signalsFound: urlSignals.length,
        });
      } catch (error) {
        logger.warn({
          msg: 'Failed to analyze URL',
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next URL
      }
    }

    logger.info({
      msg: 'Redirect analysis completed',
      totalUrls: urls.length,
      totalSignals: signals.length,
    });

    return signals;
  }

  /**
   * Validate domain (whitelist and legitimate TLD check)
   * Called once per URL before behavioral analysis
   */
  private async validateDomain(
    url: string,
    domain: string
  ): Promise<{
    isWhitelisted: boolean;
    isLegitimate: boolean;
    whitelistReason?: string;
  }> {
    // Check whitelist
    const urlInput: NormalizedInput = {
      type: 'url',
      id: `temp-${Date.now()}`,
      timestamp: new Date(),
      data: { url },
    };

    const whitelistResult = await this.whitelistService.check(urlInput);

    // Check legitimate TLD (using existing method)
    const isLegitimate = this.isLegitimateDomain(domain);

    return {
      isWhitelisted: whitelistResult.isWhitelisted,
      isLegitimate,
      whitelistReason: whitelistResult.matchReason,
    };
  }

  /**
   * Detect if page is an authentication/login page
   * Called ONCE per page analysis - result is reused
   */
  /**
   * Detect if page is an authentication/login page
   * Uses smart wait strategy for dynamic content (embedded forms, iframes, etc.)
   * Called ONCE per page analysis - result is reused
   */
  private async detectAuthPage(
    page: Page,
    url: string
  ): Promise<{
    isLoginPage: boolean;
    score: number;
    confidence: number;
    signals: any[];
    evidence: any;
    authType: string;
    timingMs: number;
    waitPhase?: 'fast' | 'dynamic' | 'timeout';
  }> {
    try {
      // Use smart wait version - handles dynamic content automatically
      const result = await this.loginDetectionService.detectAuthPageWithWait(page, undefined, {
        maxWaitMs: 3000,
        fastCheckMs: 500,
        enableSmartWait: true
      });

      return {
        ...result,
        timingMs: result.timingMs ?? 0, // Ensure timingMs is always defined
      };
    } catch (error) {
      logger.warn({
        msg: 'Auth detection failed - returning defaults',
        url,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return safe defaults on failure
      return {
        isLoginPage: false,
        score: 0,
        confidence: 0,
        signals: [],
        evidence: {},
        authType: 'UNKNOWN',
        timingMs: 0,
        waitPhase: 'timeout',
      };
    }
  }

  /**
   * Detect automatic downloads on the page
   */
  private async detectDownloads(
    page: Page
  ): Promise<{
    detected: boolean;
    url?: string;
    fileName?: string;
  }> {
    return (await page.evaluate(`
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
  }

  /**
   * Detect installation prompts on the page
   */
  private async detectInstallationPrompts(
    page: Page
  ): Promise<{
    detected: boolean;
    text?: string;
  }> {
    return (await page.evaluate(`
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
  }

  /**
   * Prepare signals from malicious behavior detection results
   * Converts detection results into analysis signals
   */
  private async prepareSignals(
    url: string,
    behaviorResult: {
      automaticDownload: boolean;
      downloadUrl?: string;
      fileName?: string;
      scriptExecution: boolean;
      scriptAnalysis?: ScriptAnalysisResult;
      installationPrompt: boolean;
      promptText?: string;
      suspiciousJavaScript: boolean;
      skipMetadata?: { skipped: boolean; reason?: string };
      jsPatterns?: string[];
      redirectInfo?: {
        redirectCount: number;
        finalUrl: string;
        redirectChain: string[];
        originalDomain: string;
        finalDomain: string;
        domainChanged: boolean;
      };
    }
  ): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    // Redirect signals (suspicious redirect + domain change)
    const redirectInfo = behaviorResult.redirectInfo;
    if (redirectInfo) {
      // Signal 1: Suspicious redirect (multiple hops)
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

      // Signal 2: Domain change (separate signal)
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
              redirectChain: redirectInfo.redirectChain,
            },
          })
        );
      }
    }

    // Automatic download signal
    if (behaviorResult.automaticDownload) {
      signals.push(
        this.createSignal({
          signalType: 'automatic_download_detected',
          severity: 'critical',
          confidence: 0.95,
          description: 'Page attempts automatic file download without user interaction',
          evidence: {
            url,
            downloadUrl: behaviorResult.downloadUrl,
            fileName: behaviorResult.fileName,
          },
        })
      );
    }

    // Installation prompt signal
    if (behaviorResult.installationPrompt) {
      signals.push(
        this.createSignal({
          signalType: 'installation_prompt_detected',
          severity: 'high',
          confidence: 0.85,
          description: 'Page prompts for software installation',
          evidence: {
            url,
            promptText: behaviorResult.promptText,
          },
        })
      );
    }

    // JavaScript threat signals
    if (behaviorResult.scriptExecution && behaviorResult.scriptAnalysis) {
      const analysis = behaviorResult.scriptAnalysis;

      signals.push(
        this.createSignal({
          signalType: 'script_execution_detected',
          severity:
            analysis.threatLevel === 'critical'
              ? 'critical'
              : analysis.threatLevel === 'high'
              ? 'critical'
              : 'high',
          confidence: 0.9,
          description: `Page contains ${analysis.summary.totalInlinePatterns} suspicious inline patterns, ${analysis.summary.totalExternalThreats} external threats, ${analysis.summary.totalRuntimeEvents} runtime events, and ${analysis.summary.totalInjections} DOM injections`,
          evidence: {
            url,
            threatLevel: analysis.threatLevel,
            summary: analysis.summary,
            enrichedThreats: (analysis.findings as any).enrichedThreats,
            skipMetadata: behaviorResult.skipMetadata,
            loginPageContext: (analysis.findings as any).loginPageContext,
            inlinePatterns: analysis.findings.inlineScriptPatterns,
            externalScripts: analysis.findings.externalScripts.slice(0, 20),
            runtimeEvents: analysis.findings.runtimeEvents.slice(0, 10),
            domInjections: analysis.findings.domInjectionEvents.slice(0, 10),
          },
        })
      );
    }

    // JS scan was skipped - add informational signal
    if (behaviorResult.skipMetadata?.skipped) {
      signals.push(
        this.createSignal({
          signalType: 'js_scan_skipped',
          severity: 'low',
          confidence: 1.0,
          description: `JavaScript security scan was skipped: ${behaviorResult.skipMetadata.reason}`,
          evidence: {
            url,
            skipped: true,
            reason: behaviorResult.skipMetadata.reason,
            timeSaved: '~2000-3000ms',
            explanation:
              'JS scan was safely skipped due to trusted domain and login page detection. No threats expected in this scenario.',
          },
        })
      );
    }

    return signals;
  }

  /**
   * Get redirect information from page after navigation
   * Called AFTER page.goto() completes
   */
  private getRedirectInfo(
    page: Page,
    url: string,
    redirectCount: number,
    redirectChain: string[]
  ): {
    redirectCount: number;
    finalUrl: string;
    redirectChain: string[];
    originalDomain: string;
    finalDomain: string;
    domainChanged: boolean;
  } {
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
   * Detect malicious behaviors on the page
   */
  private async detectMaliciousBehaviors(
    url: string,
    domainInfo: {
      isWhitelisted: boolean;
      isLegitimate: boolean;
      whitelistReason?: string;
    }
  ): Promise<{
    automaticDownload: boolean;
    downloadUrl?: string;
    fileName?: string;
    scriptExecution: boolean;
    scriptAnalysis?: ScriptAnalysisResult;
    installationPrompt: boolean;
    promptText?: string;
    suspiciousJavaScript: boolean;
    skipMetadata?: { skipped: boolean; reason?: string };
    jsPatterns?: string[];
    redirectInfo?: {
      redirectCount: number;
      finalUrl: string;
      redirectChain: string[];
      originalDomain: string;
      finalDomain: string;
      domainChanged: boolean;
    };
  }> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const result: any = {
      automaticDownload: false,
      scriptExecution: false,
      installationPrompt: false,
      suspiciousJavaScript: false,
    };

    try {
      logger.info({
        msg: 'Starting behavioral analysis',
        url,
        isWhitelisted: domainInfo.isWhitelisted,
        isLegitimate: domainInfo.isLegitimate,
      });

      // ============================================================
      // PHASE 1: SETUP & NAVIGATION
      // ============================================================

      // Setup redirect tracking BEFORE navigation
      const redirectChain: string[] = [url];
      let redirectCount = 0;

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

      await this.setupSecurityHooks(page);
      logger.debug({ msg: 'Security hooks installed', url });

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.analysis.timeouts.dynamic,
      });
      logger.debug({ msg: 'Page navigation completed', url });

      // Capture redirect information after navigation
      const redirectInfo = this.getRedirectInfo(page, url, redirectCount, redirectChain);

      if (redirectInfo.redirectCount > 0 || redirectInfo.domainChanged) {
        result.redirectInfo = redirectInfo;
        logger.info({
          msg: 'Redirect detected',
          url,
          redirectCount: redirectInfo.redirectCount,
          domainChanged: redirectInfo.domainChanged,
          finalUrl: redirectInfo.finalUrl,
        });
      }

      // ============================================================
      // PHASE 2: AUTH DETECTION (ONCE - reuse result everywhere)
      // ============================================================
      const authDetectionStart = Date.now();
      const authDetection = await this.detectAuthPage(page, url);
      const authDetectionDuration = Date.now() - authDetectionStart;

      logger.info({
        msg: 'Auth detection completed',
        url,
        isAuthPage: authDetection.isLoginPage,
        authType: authDetection.authType,
        score: authDetection.score,
        confidence: authDetection.confidence,
        signalCount: authDetection.signals?.length || 0,
        waitPhase: authDetection.waitPhase,
        timingMs: authDetectionDuration,
      });

      // Store auth result in behavior result for signal preparation
      result.authDetection = authDetection;

      // ============================================================
      // PHASE 3: MALICIOUS BEHAVIOR CHECKS (PARALLEL with timeout)
      // Pattern: Promise.allSettled + Promise.race (overall timeout)
      // ============================================================
      logger.debug({ msg: 'Checking for malicious behaviors', url });

      const behaviorChecksStart = Date.now();

      const BEHAVIOR_CHECKS_TIMEOUT_MS = 8000;
      const behaviorChecksPromise = Promise.allSettled([
        this.detectDownloads(page),
        this.detectInstallationPrompts(page),
      ]);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Behavior checks timeout')),
          BEHAVIOR_CHECKS_TIMEOUT_MS
        )
      );

      let behaviorResults: PromiseSettledResult<any>[];
      let timedOut = false;

      try {
        behaviorResults = await Promise.race([behaviorChecksPromise, timeoutPromise]);
      } catch (error) {
        timedOut = true;
        logger.warn({
          msg: 'Behavior checks timed out',
          url,
          timeoutMs: BEHAVIOR_CHECKS_TIMEOUT_MS,
          error: error instanceof Error ? error.message : String(error),
        });

        behaviorResults = [
          { status: 'rejected' as const, reason: new Error('Behavior checks timeout') },
          { status: 'rejected' as const, reason: new Error('Behavior checks timeout') },
        ];
      }

      const behaviorChecksDuration = Date.now() - behaviorChecksStart;

      logger.debug({
        msg: 'Behavior checks completed',
        url,
        timingMs: behaviorChecksDuration,
        timedOut,
        downloadStatus: behaviorResults[0]?.status || 'unknown',
        installPromptStatus: behaviorResults[1]?.status || 'unknown',
      });

      // Process download result
      const downloadResult = behaviorResults[0];
      if (downloadResult && downloadResult.status === 'fulfilled') {
        if (downloadResult.value?.detected) {
          result.automaticDownload = true;
          result.downloadUrl = downloadResult.value.url;
          result.fileName = downloadResult.value.fileName;
          logger.warn({
            msg: 'Automatic download detected',
            url,
            downloadUrl: downloadResult.value.url,
          });
        }
      } else if (downloadResult && downloadResult.status === 'rejected') {
        logger.warn({
          msg: 'Download check failed (ignored)',
          url,
          error: downloadResult.reason,
        });
      }

      // Process installation prompt result
      const installPromptResult = behaviorResults[1];
      if (installPromptResult && installPromptResult.status === 'fulfilled') {
        if (installPromptResult.value?.detected) {
          result.installationPrompt = true;
          result.promptText = installPromptResult.value.text;
          logger.warn({
            msg: 'Installation prompt detected',
            url,
            promptText: installPromptResult.value.text,
          });
        }
      } else if (installPromptResult && installPromptResult.status === 'rejected') {
        logger.warn({
          msg: 'Installation prompt check failed (ignored)',
          url,
          error: installPromptResult.reason,
        });
      }

      // ============================================================
      // PHASE 4: JAVASCRIPT SCAN DECISION
      // Skip JS scan for LOGIN pages (JavaScript is expected)
      // ============================================================
      let jsAnalysis: ScriptAnalysisResult;

      if (authDetection.isLoginPage && authDetection.score >= 5) {
        // SKIP - Login page detected
        logger.info({
          msg: 'Skipping JavaScript scan - login page detected',
          url,
          authType: authDetection.authType,
          score: authDetection.score,
          confidence: authDetection.confidence,
          reasoning:
            'Login pages naturally use JavaScript for authentication. Skipping to avoid false positives.',
        });

        jsAnalysis = {
          hasThreats: false,
          threatLevel: 'low',
          findings: {
            inlineScriptPatterns: [],
            externalScripts: [],
            runtimeEvents: [],
            domInjectionEvents: [],
          },
          summary: {
            totalInlinePatterns: 0,
            totalExternalThreats: 0,
            totalRuntimeEvents: 0,
            totalInjections: 0,
          },
        };

        // Store skip metadata with login context
        result.skipMetadata = {
          skipped: true,
          reason: `Login page detected (${authDetection.authType}, score: ${authDetection.score.toFixed(
            1
          )})`,
          loginPageContext: {
            isLoginPage: true,
            authType: authDetection.authType,
            score: authDetection.score,
            confidence: authDetection.confidence,
            keywords: authDetection.evidence?.keywords || [],
            detectionMethod: authDetection.evidence?.detectionMethod || [],
          },
        };
      } else {
        // RUN - Not a login page
        logger.info({
          msg: 'Running JavaScript scan - not a login page',
          url,
          authType: authDetection.authType,
          score: authDetection.score,
          isLoginPage: authDetection.isLoginPage,
        });

        const jsScanStart = Date.now();
        jsAnalysis = await this.scanPageForJSRisks(page, url, authDetection);
        const jsScanDuration = Date.now() - jsScanStart;

        logger.info({
          msg: 'JavaScript scan completed',
          url,
          hasThreats: jsAnalysis.hasThreats,
          threatLevel: jsAnalysis.threatLevel,
          timingMs: jsScanDuration,
        });
      }

      // ============================================================
      // PHASE 5: AGGREGATE RESULTS
      // ============================================================
      if (jsAnalysis.hasThreats) {
        result.scriptExecution = true;
        result.scriptAnalysis = jsAnalysis;
        result.suspiciousJavaScript =
          jsAnalysis.threatLevel === 'high' || jsAnalysis.threatLevel === 'critical';

        // Map to legacy format
        const allPatterns = new Set([
          ...jsAnalysis.findings.inlineScriptPatterns,
          ...jsAnalysis.findings.externalScripts.flatMap((s) => s.patterns),
          ...jsAnalysis.findings.runtimeEvents.map((e) => e.type),
        ]);
        result.jsPatterns = Array.from(allPatterns);
      }

      logger.info({
        msg: 'Behavioral analysis completed',
        url,
        hasDownload: result.automaticDownload,
        hasInstallPrompt: result.installationPrompt,
        hasScriptThreats: result.scriptExecution,
        jsScanSkipped: authDetection.isLoginPage && authDetection.score >= 5,
      });

      return result;
    } catch (error) {
      logger.error({
        msg: 'Failed to detect malicious behaviors',
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * Enterprise JavaScript Security Scanner
   * Collects security findings from inline scripts, external scripts, and runtime events
   * NOTE: setupSecurityHooks() MUST be called before navigation for runtime tracking
   */
  private async scanPageForJSRisks(
    page: Page,
    url: string,
    authDetectionResult?: {
      isLoginPage: boolean;
      score: number;
      confidence: number;
      signals: any[];
      evidence: any;
      authType: string;
    }
  ): Promise<ScriptAnalysisResult> {
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

      // Filter out analyzer's own instrumentation from runtime events
      // These are false positives - our own page.evaluate() calls being detected
      const analyzerPatterns = [
        'detectAuthPage',
        'detectDOMLogin',
        'detectShadowDOM',
        'detectIframeAuth',
        'detectOAuth',
        'detectSSO',
        'detectMFA',
        'detectCaptcha',
        'detectCSRF',
        'detectHiddenForm',
        'window.__securityEvents',
        'window.__domInjectionEvents',
        'document.body?.textContent',
        '// Extract visible text'
      ];

      const filteredRuntimeEvents = runtimeData.runtimeEvents.filter((event: any) => {
        if (event.type !== 'eval_execution') return true;

        const detail = String(event.detail || '');
        const isAnalyzerCode = analyzerPatterns.some(pattern => detail.includes(pattern));

        if (isAnalyzerCode) {
          logger.debug({
            msg: 'Filtered out analyzer instrumentation (false positive)',
            eventType: event.type,
            detailPreview: detail.substring(0, 100)
          });
          return false;
        }

        return true;
      });

      const filteredCount = runtimeData.runtimeEvents.length - filteredRuntimeEvents.length;
      if (filteredCount > 0) {
        logger.info({
          msg: 'Filtered analyzer instrumentation from runtime events',
          url,
          totalEvents: runtimeData.runtimeEvents.length,
          filteredCount,
          remainingEvents: filteredRuntimeEvents.length
        });
      }

      findings.inlineScriptPatterns = inlinePatterns;
      findings.externalScripts = externalScripts.slice(0, 20); // Limit to 20
      findings.runtimeEvents = filteredRuntimeEvents; // Use filtered events
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
      const seriousRuntimeEvents = filteredRuntimeEvents.filter((e: any) =>
        SERIOUS_RUNTIME_THREATS.has(e.type)
      );
      const benignRuntimeEvents = filteredRuntimeEvents.filter((e: any) =>
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

      if (filteredRuntimeEvents.length > 0) {
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
          totalEvents: filteredRuntimeEvents.length,
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
      const enrichedRuntimeThreats = filteredRuntimeEvents
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
      // LOGIN PAGE CONTEXT: Use provided result (NO detection here)
      // ===================================================================
      if (authDetectionResult && authDetectionResult.isLoginPage && authDetectionResult.score >= 5) {
        (findings as any).loginPageContext = {
          isLoginPage: true,
          authType: authDetectionResult.authType,
          score: authDetectionResult.score,
          confidence: authDetectionResult.confidence,
          keywords: authDetectionResult.evidence?.keywords || [],
          oauthProviders: authDetectionResult.evidence?.oauthProviders || [],
          ssoProviders: authDetectionResult.evidence?.ssoProviders || [],
          detectionMethod: authDetectionResult.evidence?.detectionMethod || [],
          reasoning: `${authDetectionResult.authType} page - JavaScript expected for authentication`,
        };

        logger.debug({
          msg: 'Login context added to JS scan results (from orchestrator)',
          url,
          authType: authDetectionResult.authType,
          score: authDetectionResult.score,
        });
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
            runtime: filteredRuntimeEvents.length,
            injections: runtimeData.domEvents.length
          }
        });
      }

      logger.info({
        msg: 'JS security scan completed',
        url,
        inlinePatterns: inlinePatterns.length,
        externalThreats: externalScripts.length,
        runtimeEvents: filteredRuntimeEvents.length,
        domInjections: runtimeData.domEvents.length
      });

      return {
        hasThreats: totalThreats > 0,
        threatLevel,
        findings,
        summary: {
          totalInlinePatterns: inlinePatterns.length,
          totalExternalThreats: externalScripts.length,
          totalRuntimeEvents: filteredRuntimeEvents.length,
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
   * Get or create browser instance.
   * Delegates to the shared `BrowserPool` so we don't spawn one chromium
   * per analyzer. The local `this.browser` field is retained (cached
   * pool reference) so downstream subclasses / tests observe the same shape.
   */
  protected async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await getBrowserPool().getBrowser('RedirectAnalyzer');
    }
    return this.browser;
  }

  /**
   * Close browser (cleanup). The pool owns the process lifecycle; this
   * simply clears the local cached reference so the next call re-fetches
   * from the pool (and the pool is what actually calls browser.close()).
   */
  async cleanup(): Promise<void> {
    this.browser = null;
    logger.debug({ msg: 'RedirectAnalyzer browser reference cleared' });
  }
}
