/**
 * Task-Based Execution Strategy
 *
 * Executes analyzers grouped by task (sender verification, links, attachments, etc.)
 * with conditional skipping - tasks only run if relevant content exists.
 *
 * Architecture:
 * 1. Parse email and extract components
 * 2. Determine which tasks to run (skip if no content)
 * 3. Load analyzers for each active task
 * 4. Execute tasks in parallel (analyzers within task also parallel)
 * 5. Aggregate signals and costs
 * 6. Calculate verdict
 */

import { BaseExecutionStrategy, ExecutionContext, ExecutionResult } from '../execution-strategy.js';
import type { AnalysisResult, AnalysisSignal, CostSummary } from '../../models/analysis-result.js';
import { isEmailInput } from '../../models/input.js';
import { getAnalyzerRegistry } from '../../engine/analyzer-registry.js';
import { getVerdictService } from '../../services/verdict.service.js';
import { getLogger } from '../../../infrastructure/logging/index.js';
import * as cheerio from 'cheerio';

const logger = getLogger();

/**
 * Extracted email content grouped by task
 */
interface ExtractedContent {
  sender: {
    from: string;
    domain: string;
    headers: Map<string, string>;
  };
  body: {
    text?: string;
    html?: string;
    subject: string;
  };
  links: string[];
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
  images: string[]; // Image sources (data URLs or external URLs)
  buttons: Array<{
    text: string;
    href?: string;
    onclick?: string;
  }>;
}

/**
 * Task execution result
 */
interface TaskResult {
  taskName: string;
  signals: AnalysisSignal[];
  duration: number;
  analyzersRun: string[];
  skipped: boolean;
  skipReason?: string;
}

export class TaskBasedExecutionStrategy extends BaseExecutionStrategy {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    this.addExecutionStep(context, 'task_based_execution_started', 'started');

    // Only applicable to email inputs
    if (!isEmailInput(context.input)) {
      logger.warn({
        msg: 'TaskBasedExecutionStrategy only supports email inputs, falling back',
        analysisId: context.analysisId,
        inputType: context.input.type,
      });
      throw new Error('TaskBasedExecutionStrategy requires email input');
    }

    // Step 1: Extract email components
    const extractStartTime = Date.now();
    const extractedContent = this.extractEmailComponents(context);
    const extractDuration = Date.now() - extractStartTime;

    this.addExecutionStep(context, 'content_extraction_completed', 'completed', {
      duration: extractDuration,
      context: {
        hasLinks: extractedContent.links.length > 0,
        hasAttachments: extractedContent.attachments.length > 0,
        hasImages: extractedContent.images.length > 0,
        hasButtons: extractedContent.buttons.length > 0,
      },
    });

    // Step 2: Determine which tasks to run (conditional skip logic)
    const activeTasks = this.determineActiveTasks(extractedContent);
    const skippedTasks = this.getSkippedTasks(extractedContent, activeTasks);

    logger.info({
      msg: 'Task execution plan determined',
      analysisId: context.analysisId,
      activeTasks,
      skippedTasks,
    });

    this.addExecutionStep(context, 'task_planning_completed', 'completed', {
      context: {
        activeTasks,
        skippedTasks,
        activeCount: activeTasks.length,
        skippedCount: skippedTasks.length,
      },
    });

    // Step 3: Execute active tasks in parallel
    const taskExecutionStartTime = Date.now();
    const taskResults = await Promise.allSettled(
      activeTasks.map((taskName) => this.executeTask(taskName, extractedContent, context))
    );
    const taskExecutionDuration = Date.now() - taskExecutionStartTime;

    // Step 4: Aggregate results
    const allSignals: AnalysisSignal[] = [];
    const analyzersRun: string[] = [];
    const completedTasks: TaskResult[] = [];
    const failedTasks: Array<{ taskName: string; error: string }> = [];

    for (let i = 0; i < taskResults.length; i++) {
      const result = taskResults[i];
      const taskName = activeTasks[i];

      if (result.status === 'fulfilled') {
        const taskResult = result.value;
        allSignals.push(...taskResult.signals);
        analyzersRun.push(...taskResult.analyzersRun);
        completedTasks.push(taskResult);

        this.addExecutionStep(context, `task_${taskName}_completed`, 'completed', {
          duration: taskResult.duration,
          context: {
            signalCount: taskResult.signals.length,
            analyzerCount: taskResult.analyzersRun.length,
            analyzers: taskResult.analyzersRun,
          },
        });
      } else {
        failedTasks.push({ taskName, error: result.reason?.message || 'Unknown error' });

        this.addExecutionStep(context, `task_${taskName}_failed`, 'failed', {
          error: result.reason?.message || 'Unknown error',
        });
      }
    }

    // Step 5: Build cost summary from cost tracking
    const costSummary: CostSummary | undefined = context.costTracking
      ? {
          totalCostUsd: context.costTracking.operations.reduce((sum, op) => sum + (op.costUsd || 0), 0),
          operations: context.costTracking.operations.map((op) => ({
            operationType: op.operationType,
            description: op.description,
            count: op.count,
            costUsd: op.costUsd,
            metadata: op.metadata,
          })),
        }
      : undefined;

    // Step 6: Calculate verdict from signals
    const analyzerRegistry = getAnalyzerRegistry();
    const analyzerWeights = analyzerRegistry.getAnalyzerWeights();
    const verdictService = getVerdictService();
    const verdict = verdictService.calculateVerdict(allSignals, analyzerWeights);

    // Build analysis result
    const analysisResult: AnalysisResult = {
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      score: verdict.score,
      alertLevel: verdict.alertLevel,
      redFlags: verdict.redFlags,
      reasoning: verdict.reasoning,
      actions: verdict.actions,
      signals: allSignals,
      metadata: {
        duration: taskExecutionDuration,
        timestamp: new Date(),
        analyzersRun,
        analysisId: context.analysisId,
        executionSteps: context.executionSteps,
        costSummary,
      },
    };

    this.addExecutionStep(context, 'task_based_execution_completed', 'completed', {
      duration: taskExecutionDuration,
      context: {
        verdict: verdict.verdict,
        score: verdict.score,
        signalCount: allSignals.length,
        analyzerCount: analyzersRun.length,
        tasksCompleted: completedTasks.length,
        tasksFailed: failedTasks.length,
        tasksSkipped: skippedTasks.length,
        totalCostUsd: costSummary?.totalCostUsd || 0,
      },
    });

    return {
      result: analysisResult,
      actualMode: 'native', // Task-based uses native analyzers
    };
  }

  getName(): string {
    return 'TaskBasedStrategy';
  }

  canExecute(context: ExecutionContext): boolean {
    // Only supports email inputs
    return isEmailInput(context.input);
  }

  /**
   * Extract email components for task-based analysis
   */
  private extractEmailComponents(context: ExecutionContext): ExtractedContent {
    if (!isEmailInput(context.input)) {
      throw new Error('Email input required');
    }

    const email = context.input.data;
    const content: ExtractedContent = {
      sender: {
        from: email.parsed.from.address,
        domain: email.parsed.from.address.split('@')[1] || '',
        headers: email.parsed.headers,
      },
      body: {
        text: email.parsed.body.text,
        html: email.parsed.body.html,
        subject: email.parsed.subject,
      },
      links: email.parsed.urls || [],
      attachments:
        email.parsed.attachments?.map((att) => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
        })) || [],
      images: [],
      buttons: [],
    };

    // Extract images and buttons from HTML if present
    if (email.parsed.body.html) {
      try {
        const $ = cheerio.load(email.parsed.body.html);

        // Extract image sources
        $('img').each((_, element) => {
          const src = $(element).attr('src');
          if (src) {
            content.images.push(src);
          }
        });

        // Extract buttons and links with onclick handlers
        $('button, a[href], input[type="button"], input[type="submit"]').each((_, element) => {
          const $el = $(element);
          content.buttons.push({
            text: $el.text().trim(),
            href: $el.attr('href'),
            onclick: $el.attr('onclick'),
          });
        });
      } catch (error) {
        logger.warn({
          msg: 'Failed to parse HTML for images/buttons extraction',
          analysisId: context.analysisId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return content;
  }

  /**
   * Determine which tasks should run based on available content
   * Tasks are conditionally skipped if no relevant content exists
   */
  private determineActiveTasks(content: ExtractedContent): string[] {
    const tasks: string[] = [];

    // Always run (always have data for email)
    tasks.push('sender_verification'); // Always has sender
    tasks.push('emotional_analysis_urgency'); // Always has body/subject

    // Conditionally run (skip if no data)
    if (content.links.length > 0) {
      tasks.push('links');
    }

    if (content.attachments.length > 0) {
      tasks.push('attachments');
    }

    if (content.images.length > 0) {
      tasks.push('images_qrcodes');
    }

    if (content.buttons.length > 0) {
      tasks.push('buttons_cta');
    }

    return tasks;
  }

  /**
   * Get list of skipped tasks with reasons
   */
  private getSkippedTasks(content: ExtractedContent, activeTasks: string[]): Array<{ task: string; reason: string }> {
    const skipped: Array<{ task: string; reason: string }> = [];
    const allTasks = ['sender_verification', 'attachments', 'links', 'emotional_analysis_urgency', 'images_qrcodes', 'buttons_cta'];

    for (const task of allTasks) {
      if (!activeTasks.includes(task)) {
        let reason = '';
        switch (task) {
          case 'links':
            reason = 'No links found in email';
            break;
          case 'attachments':
            reason = 'No attachments found in email';
            break;
          case 'images_qrcodes':
            reason = 'No images found in email';
            break;
          case 'buttons_cta':
            reason = 'No buttons/CTAs found in email';
            break;
        }
        if (reason) {
          skipped.push({ task, reason });
        }
      }
    }

    return skipped;
  }

  /**
   * Execute a single task (run all analyzers for this task in parallel)
   */
  private async executeTask(taskName: string, content: ExtractedContent, context: ExecutionContext): Promise<TaskResult> {
    const taskStartTime = Date.now();

    // Get analyzers for this task
    const analyzerRegistry = getAnalyzerRegistry();
    const allAnalyzers = analyzerRegistry.getAnalyzers();

    // Filter analyzers by task (based on task_analyzers mapping from database)
    // For now, use naming convention until we load from database
    const taskAnalyzers = this.getAnalyzersForTask(taskName, allAnalyzers);

    if (taskAnalyzers.length === 0) {
      logger.warn({
        msg: 'No analyzers found for task',
        analysisId: context.analysisId,
        taskName,
      });

      return {
        taskName,
        signals: [],
        duration: Date.now() - taskStartTime,
        analyzersRun: [],
        skipped: false,
      };
    }

    // Run analyzers in parallel
    const analyzerResults = await Promise.allSettled(
      taskAnalyzers.map(async (analyzer) => {
        const analyzerStartTime = Date.now();

        try {
          // Configure analyzer-specific options if available
          const analyzerName = analyzer.getName();
          if (context.analyzerOptions && 'setOptions' in analyzer) {
            const optionsKey = Object.keys(context.analyzerOptions).find(
              (key) => key.toLowerCase() === analyzerName.toLowerCase()
            );
            if (optionsKey && context.analyzerOptions[optionsKey]) {
              (analyzer as any).setOptions(context.analyzerOptions[optionsKey]);
            }
          }

          const signals = await analyzer.analyze(context.input);
          const analyzerDuration = Date.now() - analyzerStartTime;

          // Track costs based on analyzer type
          this.trackAnalyzerCosts(context, analyzer.getName(), signals);

          return { name: analyzer.getName(), signals, duration: analyzerDuration };
        } catch (error) {
          const analyzerDuration = Date.now() - analyzerStartTime;

          logger.warn({
            msg: 'Analyzer failed in task',
            analysisId: context.analysisId,
            taskName,
            analyzer: analyzer.getName(),
            duration: analyzerDuration,
            error: error instanceof Error ? error.message : String(error),
          });

          // Return empty signals for failed analyzer (graceful degradation)
          return { name: analyzer.getName(), signals: [], duration: analyzerDuration };
        }
      })
    );

    // Collect all signals from successful analyzers
    const taskSignals: AnalysisSignal[] = [];
    const analyzersRun: string[] = [];

    for (const result of analyzerResults) {
      if (result.status === 'fulfilled') {
        taskSignals.push(...result.value.signals);
        analyzersRun.push(result.value.name);
      }
    }

    const taskDuration = Date.now() - taskStartTime;

    return {
      taskName,
      signals: taskSignals,
      duration: taskDuration,
      analyzersRun,
      skipped: false,
    };
  }

  /**
   * Track costs incurred by an analyzer based on its type and signals
   */
  private trackAnalyzerCosts(context: ExecutionContext, analyzerName: string, signals: AnalysisSignal[]): void {
    const name = analyzerName.toLowerCase();

    // SenderReputationAnalyzer: WHOIS + DNS lookups
    if (name === 'senderreputationanalyzer') {
      // DNS lookups (MX, A, SPF, DMARC queries)
      this.reportCost(context, 'dns_lookup', 'DNS queries for sender domain validation', 4); // MX, A, TXT (SPF), TXT (DMARC)

      // WHOIS lookup (only if enabled and successful - check signals for domain age)
      const hasDomainAgeSignal = signals.some((s) => s.signalType === 'domain_recently_registered');
      if (hasDomainAgeSignal || signals.length > 0) {
        // WHOIS was likely performed
        this.reportCost(context, 'whois_lookup', 'WHOIS lookup for domain age verification', 1);
      }
    }

    // ContentAnalysisAnalyzer: AI API call
    if (name === 'contentanalysisanalyzer' && signals.length > 0) {
      // Approximate token usage and cost (adjust based on actual implementation)
      const estimatedTokens = 500; // Average for email body analysis
      const costPer1kTokens = 0.003; // Claude Sonnet pricing (example)
      const estimatedCost = (estimatedTokens / 1000) * costPer1kTokens;

      this.reportCost(context, 'ai_api_call', 'AI-powered content analysis', 1, estimatedCost, {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        tokensUsed: estimatedTokens,
      });
    }

    // FormAnalyzer: Browser automation
    if (name === 'formanalyzer' && signals.length > 0) {
      // Each URL checked requires browser launch
      const urlsChecked = signals.filter((s) => s.signalType === 'form_detected').length;
      if (urlsChecked > 0) {
        this.reportCost(context, 'browser_automation', 'Browser automation for form detection', urlsChecked, undefined, {
          browser: 'playwright',
          urlsChecked,
        });
      }
    }

    // RedirectAnalyzer: Browser automation
    if (name === 'redirectanalyzer' && signals.length > 0) {
      const urlsChecked = signals.filter((s) => s.signalType === 'suspicious_redirect').length;
      if (urlsChecked > 0) {
        this.reportCost(context, 'browser_automation', 'Browser automation for redirect detection', urlsChecked, undefined, {
          browser: 'playwright',
          urlsChecked,
        });
      }
    }

    // LinkReputationAnalyzer: External API calls
    if (name === 'linkreputationanalyzer' && signals.length > 0) {
      const urlsChecked = signals.filter((s) =>
        ['url_flagged_malicious', 'url_flagged_suspicious', 'url_in_phishing_database'].includes(s.signalType)
      ).length;

      if (urlsChecked > 0) {
        this.reportCost(context, 'external_api_call', 'URL reputation check via external API', urlsChecked, undefined, {
          provider: 'virustotal', // or detect from context.apiCredentials
          apiKeyUsed: !!context.apiCredentials,
        });
      }
    }

    // ImageAnalyzer: OCR operations (CPU-intensive but free)
    if (name === 'imageanalyzer' && signals.length > 0) {
      const imagesProcessed = signals.filter((s) => s.signalType === 'image_contains_phishing_text').length;
      if (imagesProcessed > 0) {
        this.reportCost(context, 'external_api_call', 'OCR text extraction from images', imagesProcessed, 0, {
          provider: 'tesseract.js',
          imagesProcessed,
        });
      }
    }

    // QRCodeAnalyzer: QR decoding (free)
    if (name === 'qrcodeanalyzer' && signals.length > 0) {
      const qrCodesDecoded = signals.filter((s) =>
        ['qrcode_malicious_url', 'qrcode_suspicious_url'].includes(s.signalType)
      ).length;
      if (qrCodesDecoded > 0) {
        this.reportCost(context, 'external_api_call', 'QR code decoding and analysis', qrCodesDecoded, 0, {
          provider: 'jsqr',
          qrCodesDecoded,
        });
      }
    }
  }

  /**
   * Get analyzers for a specific task
   * Maps task names to analyzer names based on task_analyzers table mapping
   */
  private getAnalyzersForTask(taskName: string, allAnalyzers: any[]): any[] {
    // Task-to-analyzer mapping (from database schema)
    const taskAnalyzerMap: Record<string, string[]> = {
      sender_verification: ['spfAnalyzer', 'dkimAnalyzer', 'senderReputationAnalyzer'],
      attachments: ['attachmentAnalyzer'],
      links: ['urlEntropyAnalyzer', 'linkReputationAnalyzer', 'formAnalyzer', 'redirectAnalyzer'],
      emotional_analysis_urgency: ['contentAnalysisAnalyzer'],
      images_qrcodes: ['imageAnalyzer', 'qrcodeAnalyzer'],
      buttons_cta: ['buttonAnalyzer'],
    };

    const analyzerNames = taskAnalyzerMap[taskName] || [];

    return allAnalyzers.filter((analyzer) =>
      analyzerNames.some((name) => analyzer.getName().toLowerCase() === name.toLowerCase())
    );
  }
}
