/**
 * AI Execution Service
 *
 * Handles AI-powered analysis with support for multiple providers:
 * - Anthropic (Claude)
 * - OpenAI (GPT)
 * - Google (Gemini)
 *
 * Features:
 * - Provider abstraction
 * - Cost calculation
 * - Token tracking
 * - Timeout handling
 * - Response parsing to signals
 */

import type { NormalizedInput } from '../models/input.js';
import { isEmailInput, isUrlInput } from '../models/input.js';
import { getKnownDomainPolicy } from '../policies/known-domain.policy.js';
import type { AnalysisSignal, SignalSeverity } from '../models/analysis-result.js';
import type { AIMetadata } from './analysis-persistence.service.js';
import type { EnhancedContentRiskProfile } from '../analyzers/risk/content-risk.analyzer.js';
import { getLogger } from '../../infrastructure/logging/logger.js';
import { query } from '../../infrastructure/database/client.js';

const logger = getLogger();

/**
 * Standard JSON output format for AI responses
 * Ensures consistent parseable structure
 * This will be enforced at the UI level when creating/editing templates
 */
export const STANDARD_JSON_OUTPUT_FORMAT = `

═══════════════════════════════════════════════════════════
CRITICAL: OUTPUT FORMAT REQUIREMENT
═══════════════════════════════════════════════════════════

You MUST respond with ONLY a valid JSON array. No text before or after.

Required JSON structure:
[
  {
    "signalType": "suspicious_sender|phishing_keywords|suspicious_url|typosquatting|credential_harvesting|urgent_language|brand_impersonation|attachment_malicious|qrcode_suspicious|...",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "Plain English explanation of this signal"
  },
  {
    "signalType": "final_verdict",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "VERDICT: [Safe|Suspicious|Malicious]\\n\\nTHREAT SUMMARY:\\n[2-3 sentences]\\n\\nPRIMARY INDICATORS:\\n- Indicator 1\\n- Indicator 2\\n\\nRECOMMENDED ACTION:\\n[Specific action]"
  }
]

IMPORTANT:
- Response must START with [ and END with ]
- All strings must be properly escaped
- Use \\n for line breaks in descriptions
- Confidence must be between 0.0 and 1.0
- Include at least one signal (can be just final_verdict if clean)
- Last signal should always be "final_verdict" with comprehensive description
`;

/**
 * Prompt Template from Database
 */
interface PromptTemplate {
  id: string;
  name: string;
  systemPrompt: string | null;
  userPrompt: string;
  promptType: 'system' | 'user' | 'combined';
}

/**
 * AI Provider Configuration
 */
export interface AIProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  promptTemplateId?: string; // Optional template override
  /** Optional AI model id used for log enrichment when legacy fallback happens */
  aiModelId?: string;
  /** Optional integration name used for log enrichment when legacy fallback happens */
  integrationName?: string;
}

/**
 * Parse error info - set on JSON parse failure
 */
export interface AIParseError {
  message: string;
  position?: number;
}

/**
 * Records which prompt the run actually used, so the Debug UI can
 * show "template X" vs "legacy fallback, reason=...". Stored inside
 * ai_metadata JSONB - no schema migration required.
 */
export type PromptSource =
  | { type: 'template'; id: string; name: string }
  | {
      type: 'legacy';
      reason: 'no_template_id' | 'template_not_found' | 'load_error';
      templateId?: string;
    };

/**
 * Provider debug blob - captured for every AI call so we can surface
 * the actual request, raw response, and any parse error in debug views.
 * API keys live in headers or URL query params and are never captured here.
 */
export interface AIProviderDebug {
  apiUrl: string;
  apiRequest: unknown;
  apiResponse: unknown;
  rawContent: string;
  parseError: AIParseError | null;
  fallbackReparseUsed: boolean;
  promptSource: PromptSource;
}

/**
 * AI Response Structure
 */
interface AIResponse {
  signals: AnalysisSignal[];
  metadata: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
  debug: AIProviderDebug;
}

/**
 * Result of parsing an AI response body
 */
interface ParseResult {
  signals: AnalysisSignal[];
  parseError: AIParseError | null;
}

/** Maximum stored size (in bytes/chars) for apiResponse blob and rawContent */
const MAX_STORED_BLOB_BYTES = 64 * 1024;

/**
 * AI Execution Service
 */
export class AIExecutionService {
  /**
   * Execute analysis with AI
   */
  async executeWithAI(
    input: NormalizedInput,
    config: AIProviderConfig,
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<{
    signals: AnalysisSignal[];
    metadata: AIMetadata;
  }> {
    const startTime = Date.now();

    logger.info({
      msg: 'AI execution started',
      provider: config.provider,
      model: config.model,
      inputType: input.type,
      hasRiskProfile: !!riskProfile,
    });

    try {
      // Call appropriate provider with risk profile
      const response = await this.callProvider(input, config, riskProfile);

      // Calculate cost
      const costUsd = this.calculateCost(
        config.provider,
        config.model,
        response.metadata.promptTokens,
        response.metadata.completionTokens
      );

      const latencyMs = Date.now() - startTime;

      const metadata: AIMetadata = {
        provider: config.provider,
        model: config.model,
        tokens: {
          prompt: response.metadata.promptTokens,
          completion: response.metadata.completionTokens,
          total: response.metadata.totalTokens,
        },
        temperature: config.temperature || 0.7,
        latencyMs,
        costUsd,
        apiUrl: response.debug.apiUrl,
        apiRequest: response.debug.apiRequest,
        apiResponse: this.truncateForStorage(response.debug.apiResponse, MAX_STORED_BLOB_BYTES),
        rawContent: this.truncateString(response.debug.rawContent, MAX_STORED_BLOB_BYTES),
        parseError: response.debug.parseError,
        fallbackReparseUsed: response.debug.fallbackReparseUsed,
        promptSource: response.debug.promptSource,
      };

      logger.info({
        msg: 'AI execution completed',
        provider: config.provider,
        model: config.model,
        latencyMs,
        costUsd,
        signalCount: response.signals.length,
      });

      return {
        signals: response.signals,
        metadata,
      };
    } catch (error) {
      logger.error({
        msg: 'AI execution failed',
        provider: config.provider,
        model: config.model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Call AI provider based on configuration
   */
  private async callProvider(
    input: NormalizedInput,
    config: AIProviderConfig,
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<AIResponse> {
    switch (config.provider.toLowerCase()) {
      case 'anthropic':
        return await this.callAnthropic(input, config, riskProfile);
      case 'openai':
        return await this.callOpenAI(input, config, riskProfile);
      case 'google':
        return await this.callGoogle(input, config, riskProfile);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(
    input: NormalizedInput,
    config: AIProviderConfig,
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<AIResponse> {
    const apiUrl = 'https://api.anthropic.com/v1/messages';

    try {
      const { systemPrompt, userPrompt, promptSource } = await this.buildPrompt(
        input,
        config,
        riskProfile
      );
      const startTime = Date.now();

      // Build messages array with optional system prompt
      const messages: any[] = [];
      if (systemPrompt) {
        messages.push({ role: 'user', content: systemPrompt });
        messages.push({ role: 'assistant', content: 'Understood. I will analyze according to these guidelines.' });
      }
      messages.push({ role: 'user', content: userPrompt });

      const requestBody = {
        model: config.model,
        max_tokens: config.maxTokens || 4096,
        temperature: config.temperature || 0.7,
        messages,
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;
      const rawContent: string = data?.content?.[0]?.text ?? '';

      // Parse response to signals
      const primary = this.parseAnthropicResponse(rawContent, input);
      let signals = primary.signals;
      let parseError = primary.parseError;
      let fallbackReparseUsed = false;

      // FALLBACK: If parsing failed (empty signals), try re-parsing
      if (signals.length === 0 && rawContent.length > 0) {
        logger.warn({
          msg: 'Initial parsing produced zero signals - attempting fallback re-parse',
          provider: 'anthropic',
        });

        const fallback = await this.fallbackReparse(rawContent, config);
        if (fallback.signals.length > 0) {
          signals = fallback.signals;
          fallbackReparseUsed = true;
          // parseError remains set from the primary attempt so the UI
          // can still see why the first parse failed.
        } else if (fallback.parseError) {
          parseError = fallback.parseError;
        }
      }

      return {
        signals,
        metadata: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          latencyMs,
        },
        debug: {
          apiUrl: this.sanitizeApiUrl(apiUrl),
          apiRequest: requestBody,
          apiResponse: data,
          rawContent,
          parseError,
          fallbackReparseUsed,
          promptSource,
        },
      };
    } catch (error) {
      // Extract detailed error information
      const errorDetails = this.extractFetchErrorDetails(error, apiUrl, config);

      logger.error({
        msg: 'Anthropic API call failed',
        ...errorDetails,
      });

      // Throw enriched error with user-friendly message
      throw new Error(errorDetails.userMessage);
    }
  }

  /**
   * Call OpenAI GPT API
   */
  private async callOpenAI(
    input: NormalizedInput,
    config: AIProviderConfig,
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<AIResponse> {
    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    try {
      const { systemPrompt, userPrompt, promptSource } = await this.buildPrompt(
        input,
        config,
        riskProfile
      );
      const startTime = Date.now();

      // Build messages with system prompt
      const messages: any[] = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      } else {
        messages.push({
          role: 'system',
          content: 'You are a phishing detection expert. Analyze the provided content and identify security signals.',
        });
      }
      messages.push({ role: 'user', content: userPrompt });

      const requestBody = {
        model: config.model,
        max_tokens: config.maxTokens || 4096,
        temperature: config.temperature || 0.7,
        messages,
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;
      const rawContent: string = data?.choices?.[0]?.message?.content ?? '';

      // Parse response to signals
      const primary = this.parseOpenAIResponse(rawContent, input);
      let signals = primary.signals;
      let parseError = primary.parseError;
      let fallbackReparseUsed = false;

      // FALLBACK: If parsing failed (empty signals), try re-parsing
      if (signals.length === 0 && rawContent.length > 0) {
        logger.warn({
          msg: 'Initial parsing produced zero signals - attempting fallback re-parse',
          provider: 'openai',
        });

        const fallback = await this.fallbackReparse(rawContent, config);
        if (fallback.signals.length > 0) {
          signals = fallback.signals;
          fallbackReparseUsed = true;
        } else if (fallback.parseError) {
          parseError = fallback.parseError;
        }
      }

      return {
        signals,
        metadata: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          latencyMs,
        },
        debug: {
          apiUrl: this.sanitizeApiUrl(apiUrl),
          apiRequest: requestBody,
          apiResponse: data,
          rawContent,
          parseError,
          fallbackReparseUsed,
          promptSource,
        },
      };
    } catch (error) {
      // Extract detailed error information
      const errorDetails = this.extractFetchErrorDetails(error, apiUrl, config);

      logger.error({
        msg: 'OpenAI API call failed',
        ...errorDetails,
      });

      // Throw enriched error with user-friendly message
      throw new Error(errorDetails.userMessage);
    }
  }

  /**
   * Call Google Gemini API
   */
  private async callGoogle(
    input: NormalizedInput,
    config: AIProviderConfig,
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<AIResponse> {
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/${config.model}:generateContent?key=${config.apiKey}`;

    try {
      const { systemPrompt, userPrompt, promptSource } = await this.buildPrompt(
        input,
        config,
        riskProfile
      );
      const startTime = Date.now();

      // Combine system and user prompts for Google (it doesn't have separate system prompts)
      const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${userPrompt}` : userPrompt;

      const requestBody = {
        contents: [
          {
            parts: [{ text: combinedPrompt }],
          },
        ],
        generationConfig: {
          temperature: config.temperature || 0.7,
          maxOutputTokens: config.maxTokens || 4096,
        },
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;
      const rawContent: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      // Parse response to signals
      const primary = this.parseGoogleResponse(rawContent, input);
      const signals = primary.signals;
      const parseError = primary.parseError;

      // FALLBACK: If parsing failed (empty signals), try re-parsing
      // Note: Google fallback not implemented in fallbackReparse method yet
      if (signals.length === 0 && rawContent.length > 0) {
        logger.warn({
          msg: 'Initial parsing produced zero signals - fallback re-parse not supported for Google',
          provider: 'google',
        });
      }

      return {
        signals,
        metadata: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
          latencyMs,
        },
        debug: {
          apiUrl: this.sanitizeApiUrl(apiUrl),
          apiRequest: requestBody,
          apiResponse: data,
          rawContent,
          parseError,
          fallbackReparseUsed: false,
          promptSource,
        },
      };
    } catch (error) {
      // Extract detailed error information
      const errorDetails = this.extractFetchErrorDetails(error, apiUrl, config);

      logger.error({
        msg: 'Google API call failed',
        ...errorDetails,
      });

      // Throw enriched error with user-friendly message
      throw new Error(errorDetails.userMessage);
    }
  }

  /**
   * Load prompt template from database.
   *
   * Returns:
   *   { ok: true, template } on success,
   *   { ok: false, reason: 'not_found' } when the id does not exist or is soft-deleted,
   *   { ok: false, reason: 'load_error' } when the DB query throws.
   */
  private async loadTemplate(
    templateId: string
  ): Promise<
    | { ok: true; template: PromptTemplate }
    | { ok: false; reason: 'not_found' | 'load_error' }
  > {
    try {
      const result = await query(
        `SELECT id, name, system_prompt AS "systemPrompt", user_prompt AS "userPrompt",
                prompt_type AS "promptType"
         FROM prompt_templates
         WHERE id = $1 AND deleted_at IS NULL`,
        [templateId]
      );

      if (result.rows.length === 0) {
        logger.warn({ templateId }, 'Prompt template not found');
        return { ok: false, reason: 'not_found' };
      }

      return { ok: true, template: result.rows[0] as PromptTemplate };
    } catch (error) {
      logger.error({ error, templateId }, 'Failed to load prompt template');
      return { ok: false, reason: 'load_error' };
    }
  }

  /**
   * Build template variables from input and risk profile
   */
  private buildTemplateVariables(
    input: NormalizedInput,
    riskProfile?: EnhancedContentRiskProfile
  ): Record<string, any> {
    const vars: Record<string, any> = {};

    if (isEmailInput(input)) {
      // Basic email fields
      vars['sender_email'] = input.data.parsed?.from?.address || 'unknown';
      vars['sender_domain'] = input.data.parsed?.from?.address?.split('@')[1] || 'unknown';
      vars['display_name'] = input.data.parsed?.from?.name || '';
      vars['reply_to'] = input.data.parsed?.headers?.get('Reply-To') || '';
      vars['subject'] = input.data.parsed?.subject || '';
      vars['body'] = input.data.parsed?.body?.text || input.data.parsed?.body?.html || '';
      vars['body_snippet'] = (vars['body'] as string).substring(0, 200);
      vars['body_preview'] = (vars['body'] as string).substring(0, 500);

      // auth_guidance is always set for email inputs so {{auth_guidance}} never renders empty
      const AUTH_GUIDANCE =
        'IMPORTANT — Email Authentication Context: SPF/DKIM failures are common on ' +
        'legitimate emails. Email forwarding changes the sending IP (breaks SPF). ' +
        'Mailing lists, corporate gateways, and security software that append ' +
        'disclaimers or footers after signing will break DKIM. ' +
        'Auth failure alone MUST only contribute to a Suspicious verdict — ' +
        'never escalate to Malicious without additional corroborating indicators ' +
        '(credential forms, typosquatting, phishing content, etc.).';

      vars['auth_guidance'] = AUTH_GUIDANCE;

      // role_guidance is always set for email inputs so {{role_guidance}} never renders empty
      const ROLE_GUIDANCE =
        'IMPORTANT — Role Address Context: Role-based addresses such as ' +
        'noreply@, notifications@, auto-confirm@, service@, billing@, support@ ' +
        'are standard practice for legitimate transactional senders (banks, ' +
        'retailers, SaaS platforms, code hosts). Role-account alone MUST NOT ' +
        'drive a Suspicious verdict without additional corroborating indicators ' +
        '(typosquatting, urgency tactics, credential forms, unusual attachments, ' +
        'grammar issues, suspicious links).';

      vars['role_guidance'] = ROLE_GUIDANCE;
      vars['auth_verification_note'] = ''; // overwritten below if statuses are missing

      // Risk profile data
      if (riskProfile) {
        // Sender info
        if (riskProfile.sender) {
          const toAuthStatus = (v: boolean | undefined): string =>
            v === true ? 'pass' : v === false ? 'fail' : 'none';

          const spf   = toAuthStatus(riskProfile.sender.hasAuthentication?.spf);
          const dkim  = toAuthStatus(riskProfile.sender.hasAuthentication?.dkim);
          const dmarc = toAuthStatus(riskProfile.sender.hasAuthentication?.dmarc);

          vars['spf_status']  = spf;
          vars['dkim_status'] = dkim;
          vars['dmarc_status'] = dmarc;

          const missingAuth = spf === 'none' || dkim === 'none' || dmarc === 'none';
          if (missingAuth) {
            vars['auth_verification_note'] =
              `Note: Some authentication statuses (SPF=${spf}, DKIM=${dkim}, DMARC=${dmarc}) ` +
              `were not found in email headers. Please verify missing statuses by checking ` +
              `DNS TXT records and WHOIS data for the sender domain.`;

            logger.info(
              { spf, dkim, dmarc, senderDomain: riskProfile.sender.domain, authVerificationNote: vars['auth_verification_note'] },
              'Missing auth statuses — DNS/WHOIS verification note injected into prompt'
            );
          }

          // idiomatic Pino: fields in first arg object, message as second arg
          logger.info(
            { spf, dkim, dmarc, senderDomain: riskProfile.sender.domain, missingAuth },
            'Email authentication status for AI analysis'
          );

          vars['is_role_account'] = riskProfile.sender.isRole;
          vars['is_disposable']   = riskProfile.sender.isDisposable;
        }

        // Domain info
        if (riskProfile.domains) {
          vars['all_domains'] = riskProfile.domains.allDomains.join(', ');
          vars['external_domains'] = riskProfile.domains.externalDomains.join(', ');
          vars['suspicious_domains'] = riskProfile.domains.suspiciousDomains.join(', ');
          vars['typosquatting_detected'] = riskProfile.domains.suspiciousDomains.length > 0;
        }

        // Links
        if (riskProfile.linkMetadata) {
          vars['link_count'] = riskProfile.linkMetadata.length;
          vars['top_links'] = riskProfile.linkMetadata.slice(0, 5);
          const suspiciousLinks = riskProfile.linkMetadata.filter(l => l.isSuspicious);
          vars['suspicious_links'] = suspiciousLinks;
          vars['suspicious_links_summary'] = `${suspiciousLinks.length} suspicious link(s)`;
        }

        // Urgency
        vars['urgency_score'] = riskProfile.urgencyScore || 0;
        vars['urgency_detected'] = riskProfile.hasUrgencyLanguage;
        vars['urgency_indicators'] = riskProfile.urgencyIndicators || [];
        vars['urgency_phrases'] = riskProfile.urgencyIndicators || [];

        // Attachments
        if (riskProfile.attachmentMetadata) {
          vars['attachments'] = riskProfile.attachmentMetadata;
          vars['attachment_count'] = riskProfile.attachmentMetadata.length;
          vars['attachment_summary'] = riskProfile.attachmentMetadata
            .map(a => `${a.filename} (${a.extension})`)
            .join(', ');
        }

        // QR Codes
        if (riskProfile.qrCodes) {
          vars['qr_codes'] = riskProfile.qrCodes.length;
          vars['qr_code_count'] = riskProfile.qrCodes.length;
        }

        // Forms
        if (riskProfile.htmlStructure) {
          const passwordForms = riskProfile.htmlStructure.forms.filter(f => f.hasPasswordField);
          vars['password_forms'] = passwordForms.length;
          vars['form_actions'] = riskProfile.htmlStructure.forms.map(f => ({
            action: f.action,
            method: f.method,
          }));
        }

        // Buttons
        if (riskProfile.buttons) {
          vars['buttons'] = riskProfile.buttons;
          vars['button_count'] = riskProfile.buttons.length;
          vars['suspicious_buttons'] = riskProfile.buttons.filter(b => b.isSuspicious);
        }
      }
    } else if (isUrlInput(input)) {
      vars['url'] = input.data.url;
      if (riskProfile?.linkMetadata && riskProfile.linkMetadata.length > 0) {
        const link = riskProfile.linkMetadata[0];
        if (link) {
          vars['domain'] = link.domain;
          vars['path'] = link.path;
          vars['is_shortened'] = link.isShortened;
          vars['is_suspicious'] = link.isSuspicious;
        }
      }

      // Live URL fetch payload. These placeholders allow url-inspect prompts
      // to reason about what the headless browser actually observed:
      //   {{url.finalUrl}}              - end of redirect chain
      //   {{url.redirectChain}}         - comma-separated navigation chain
      //   {{url.hasAutomaticDownload}}  - browser-triggered download flag
      //   {{url.renderedHtmlExcerpt}}   - truncated DOM of rendered page
      //   {{url.hasPasswordField}}      - credential form observed
      //   {{url.scriptSources}}         - external script src list
      //   {{url.iframeSources}}         - iframe src list
      //   {{url.status}}                - HTTP response status
      const fetch = riskProfile?.urlFetch;
      vars['url.requestedUrl'] = fetch?.requestedUrl ?? input.data.url;
      vars['url.finalUrl'] = fetch?.finalUrl ?? '';
      vars['url.status'] = fetch?.status != null ? String(fetch.status) : '';
      vars['url.redirectChain'] = fetch ? fetch.redirectChain.join(' -> ') : '';
      vars['url.redirectHops'] = fetch ? String(fetch.redirectChain.length) : '0';
      vars['url.hasAutomaticDownload'] = fetch ? String(fetch.hasAutomaticDownload) : 'false';
      vars['url.hasPasswordField'] = fetch ? String(fetch.hasPasswordField) : 'false';
      vars['url.renderedHtmlExcerpt'] = fetch?.renderedHtmlExcerpt ?? '';
      vars['url.scriptSources'] = fetch ? fetch.scriptSources.slice(0, 20).join(', ') : '';
      vars['url.iframeSources'] = fetch ? fetch.iframeSources.slice(0, 20).join(', ') : '';
      vars['url.fetchError'] = fetch?.fetchError ?? '';

      // Known-domain policy hints. Synchronous (Tranco snapshot +
      // KNOWN_AUTH_ORIGINS only); WHOIS is not issued from the prompt path —
      // the URL analyzer subclasses perform any needed WHOIS enrichment.
      try {
        const policy = getKnownDomainPolicy();
        const isKnown = policy.isKnownSafeUrl(input.data.url);
        vars['url.isKnownSafeHost'] = String(isKnown);
        vars['url.registrableDomain'] =
          policy.extractRegistrableDomain(policy.extractHostname(input.data.url) ?? '') ?? '';
      } catch {
        vars['url.isKnownSafeHost'] = '';
        vars['url.registrableDomain'] = '';
      }

      // Domain age placeholder: populated only if the URL analyzer pipeline
      // already enriched the profile (we don't issue WHOIS from here).
      vars['url.domainAgeDays'] = '';
    }

    return vars;
  }

  /**
   * Interpolate template with variables (simple Handlebars-like)
   */
  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;

    // Handle simple {{variable}} replacements. Keys may contain '.' (e.g.
    // "url.finalUrl"), which is a regex metachar; escape it explicitly so
    // "{{url.finalUrl}}" does not also match "{{urlXfinalUrl}}".
    const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, 'g');
      const replacement = value !== undefined && value !== null ? String(value) : '';
      result = result.replace(regex, replacement);
    });

    // Handle {{#if condition}} blocks (basic implementation)
    result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, condition, content) => {
      const value = variables[condition];
      const isTruthy = value && value !== 'false' && value !== '0' && value !== 'unknown';
      return isTruthy ? content : '';
    });

    // Handle {{#each array}} blocks (basic implementation)
    result = result.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, arrayName, content) => {
      const array = variables[arrayName];
      if (!Array.isArray(array) || array.length === 0) return '';

      return array.map((item, index) => {
        let itemContent = content;
        // Replace {{@index}}
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index + 1));
        // Replace {{this.property}}
        if (typeof item === 'object') {
          Object.entries(item).forEach(([prop, val]) => {
            const propRegex = new RegExp(`\\{\\{this\\.${prop}\\}\\}`, 'g');
            itemContent = itemContent.replace(propRegex, val !== undefined ? String(val) : '');
          });
        } else {
          itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
        }
        return itemContent;
      }).join('');
    });

    return result;
  }

  /**
   * Build analysis prompt for AI with enhanced context
   * Now supports prompt templates!
   *
   * Returns the resolved prompt plus a `promptSource` record. Callers put
   * this in the AI debug blob so the Admin UI can show whether the
   * configured template was honored or we fell back to the legacy string.
   */
  private async buildPrompt(
    input: NormalizedInput,
    config: AIProviderConfig,
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<{
    systemPrompt?: string;
    userPrompt: string;
    promptSource: PromptSource;
  }> {
    if (!config.promptTemplateId) {
      logger.warn(
        {
          msg: 'No prompt template linked - using legacy fallback prompt',
          integrationName: config.integrationName,
          aiModelId: config.aiModelId,
          provider: config.provider,
          model: config.model,
          reason: 'no_template_id',
        },
        'Legacy prompt fallback'
      );
      return {
        userPrompt: this.buildLegacyPrompt(input, riskProfile),
        promptSource: { type: 'legacy', reason: 'no_template_id' },
      };
    }

    const loadResult = await this.loadTemplate(config.promptTemplateId);
    if (!loadResult.ok) {
      const reason: 'template_not_found' | 'load_error' =
        loadResult.reason === 'load_error' ? 'load_error' : 'template_not_found';
      logger.warn(
        {
          msg: 'Configured prompt template could not be loaded - using legacy fallback',
          integrationName: config.integrationName,
          aiModelId: config.aiModelId,
          promptTemplateId: config.promptTemplateId,
          provider: config.provider,
          model: config.model,
          reason,
        },
        'Legacy prompt fallback'
      );
      return {
        userPrompt: this.buildLegacyPrompt(input, riskProfile),
        promptSource: {
          type: 'legacy',
          reason,
          templateId: config.promptTemplateId,
        },
      };
    }

    const template = loadResult.template;
    const variables = this.buildTemplateVariables(input, riskProfile);
    const userPrompt = this.interpolateTemplate(template.userPrompt, variables);
    const systemPrompt = template.systemPrompt
      ? this.interpolateTemplate(template.systemPrompt, variables)
      : undefined;

    logger.info(
      {
        templateId: template.id,
        templateName: template.name,
        integrationName: config.integrationName,
        aiModelId: config.aiModelId,
      },
      'Using prompt template'
    );

    return {
      systemPrompt,
      userPrompt,
      promptSource: { type: 'template', id: template.id, name: template.name },
    };
  }

  /**
   * Build legacy analysis prompt (original implementation)
   */
  private buildLegacyPrompt(input: NormalizedInput, riskProfile?: EnhancedContentRiskProfile): string {
    if (isEmailInput(input)) {
      // Build enhanced email prompt with risk profile
      let prompt = `Analyze this email for phishing indicators. Return a JSON array of security signals.

Email Content:
From: ${input.data.parsed?.from?.address || 'unknown'}
Subject: ${input.data.parsed?.subject || 'unknown'}
Body: ${input.data.parsed?.body?.text || input.data.parsed?.body?.html || 'empty'}`;

      // Add enhanced context from risk profile
      if (riskProfile) {
        // Sender context
        if (riskProfile.sender?.email) {
          const toAuthStatus = (v: boolean | undefined): string =>
            v === true ? 'pass' : v === false ? 'fail' : 'none';

          const spf   = toAuthStatus(riskProfile.sender.hasAuthentication?.spf);
          const dkim  = toAuthStatus(riskProfile.sender.hasAuthentication?.dkim);
          const dmarc = toAuthStatus(riskProfile.sender.hasAuthentication?.dmarc);
          const missingAuth = spf === 'none' || dkim === 'none' || dmarc === 'none';

          prompt += `\n\nSender Profile:
- Email: ${riskProfile.sender.email} (${riskProfile.sender.domain})
- Display Name: ${riskProfile.sender.displayName || 'None'}
- Role Account: ${riskProfile.sender.isRole}
- Disposable Email: ${riskProfile.sender.isDisposable}
- Authentication: SPF=${spf}, DKIM=${dkim}, DMARC=${dmarc}
- Auth Context: SPF/DKIM failures are common on legitimate emails (forwarding breaks SPF; footer injection breaks DKIM). Auth failure alone = Suspicious only — not Malicious.
- Role Context: Role-based addresses (noreply@, notifications@, auto-confirm@, service@, billing@, support@) are standard for legitimate transactional senders. Role-account alone MUST NOT drive a Suspicious verdict without corroborating indicators (typosquatting, urgency, credential forms, unusual attachments, suspicious links).`;

          if (missingAuth) {
            prompt += ` Statuses marked "none" not in headers — verify via DNS TXT records and WHOIS for ${riskProfile.sender.domain}.`;

            logger.info(
              { spf, dkim, dmarc, senderDomain: riskProfile.sender.domain },
              'Missing auth statuses — DNS/WHOIS verification note injected into legacy fallback prompt'
            );
          }

          // idiomatic Pino: fields in first arg object, message as second arg
          logger.info(
            { spf, dkim, dmarc, senderDomain: riskProfile.sender.domain, missingAuth, promptSection: 'sender_profile' },
            'Legacy fallback prompt enriched with authentication context'
          );
        }

        // Domain context
        if (riskProfile.domains && riskProfile.domains.allDomains.length > 0) {
          prompt += `\n\nDomain Analysis:
- All Domains: ${riskProfile.domains.allDomains.join(', ')}
- Sender Domain: ${riskProfile.domains.senderDomain}
- External Domains: ${riskProfile.domains.externalDomains.join(', ') || 'None'}
- Suspicious Domains: ${riskProfile.domains.suspiciousDomains.join(', ') || 'None'}`;
        }

        // Link context
        if (riskProfile.linkMetadata && riskProfile.linkMetadata.length > 0) {
          prompt += `\n\nLinks Found (${riskProfile.linkMetadata.length} total):`;
          riskProfile.linkMetadata.slice(0, 10).forEach((link) => {
            prompt += `\n- ${link.url} (${link.domain})${link.isSuspicious ? ' [SUSPICIOUS: ' + link.suspicionReasons.join(', ') + ']' : ''}${link.isShortened ? ' [URL SHORTENER]' : ''}`;
          });
        }

        // QR Code context
        if (riskProfile.qrCodes && riskProfile.qrCodes.length > 0) {
          prompt += `\n\nQR Codes Found: ${riskProfile.qrCodes.length} potential QR code(s) detected in images`;
        }

        // Attachment context
        if (riskProfile.attachmentMetadata && riskProfile.attachmentMetadata.length > 0) {
          prompt += `\n\nAttachments (${riskProfile.attachmentMetadata.length} total):`;
          riskProfile.attachmentMetadata.forEach((att) => {
            prompt += `\n- ${att.filename}${att.isSuspicious ? ' [SUSPICIOUS: ' + att.suspicionReasons.join(', ') + ']' : ''}`;
          });
        }

        // Button/CTA context
        if (riskProfile.buttons && riskProfile.buttons.length > 0) {
          const suspiciousButtons = riskProfile.buttons.filter((b) => b.isSuspicious);
          if (suspiciousButtons.length > 0) {
            prompt += `\n\nSuspicious Buttons/CTAs Found (${suspiciousButtons.length}):`;
            suspiciousButtons.slice(0, 5).forEach((btn) => {
              prompt += `\n- "${btn.text}" → ${btn.action || btn.onclick} [${btn.suspicionReasons.join(', ')}]`;
            });
          }
        }

        // Form context
        if (riskProfile.htmlStructure && riskProfile.htmlStructure.forms.length > 0) {
          const passwordForms = riskProfile.htmlStructure.forms.filter((f) => f.hasPasswordField);
          if (passwordForms.length > 0) {
            prompt += `\n\nForms with Password Fields: ${passwordForms.length} credential-harvesting form(s) detected`;
          }
        }

        // Urgency context
        if (riskProfile.hasUrgencyLanguage) {
          prompt += `\n\nUrgency Language Detected (Score: ${riskProfile.urgencyScore}/10):`;
          riskProfile.urgencyIndicators.slice(0, 5).forEach((indicator) => {
            prompt += `\n- "${indicator}"`;
          });
        }
      } else {
        // Fallback to basic URL list
        prompt += `\nURLs: ${input.data.parsed?.urls?.join(', ') || 'none'}`;
      }

      prompt += `\n\nReturn format:
[
  {
    "signalType": "suspicious_sender|phishing_keywords|suspicious_url|urgent_language|...",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "Plain English explanation"
  }
]

Focus on: sender authenticity, urgency tactics, suspicious URLs, grammar issues, impersonation attempts, credential harvesting.`;

      return prompt;
    } else if (isUrlInput(input)) {
      // URL analysis with risk profile
      let prompt = `Analyze this URL for phishing indicators. Return a JSON array of security signals.

URL: ${input.data.url}`;

      if (riskProfile?.linkMetadata && riskProfile.linkMetadata.length > 0) {
        const linkInfo = riskProfile.linkMetadata[0];
        prompt += `\n\nURL Analysis:
- Domain: ${linkInfo?.domain}
- Path: ${linkInfo?.path}
- Is Shortened: ${linkInfo?.isShortened}
- Is Suspicious: ${linkInfo?.isSuspicious}`;

        if (linkInfo?.isSuspicious) {
          prompt += `\n- Suspicion Reasons: ${linkInfo?.suspicionReasons.join(', ')}`;
        }
      }

      prompt += `\n\nReturn format:
[
  {
    "signalType": "suspicious_domain|high_entropy_url|url_shortener|typosquatting|suspicious_tld|...",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "Plain English explanation"
  }
]

Focus on: domain reputation, entropy, typosquatting, suspicious TLDs, URL patterns.`;

      return prompt;
    } else {
      return 'Analyze this content for phishing indicators.';
    }
  }

  /**
   * Parse Anthropic response to signals
   */
  private parseAnthropicResponse(responseText: string, input: NormalizedInput): ParseResult {
    return this.parseAIResponse(responseText, 'anthropic', input);
  }

  /**
   * Parse OpenAI response to signals
   */
  private parseOpenAIResponse(responseText: string, input: NormalizedInput): ParseResult {
    return this.parseAIResponse(responseText, 'openai', input);
  }

  /**
   * Parse Google response to signals
   */
  private parseGoogleResponse(responseText: string, input: NormalizedInput): ParseResult {
    return this.parseAIResponse(responseText, 'google', input);
  }

  /**
   * Extract a single top-level JSON value from a possibly-messy AI response.
   *
   * Handles:
   * 1. Surrounding whitespace.
   * 2. Markdown code fences (```json ... ``` or ``` ... ```).
   * 3. Responses where the entire trimmed body is already valid JSON
   *    (array OR object - both are returned as-is).
   * 4. Responses with prose before/after a JSON object / array by doing
   *    a balanced scan that respects string literals and escape sequences.
   *
   * Returns the parsed JSON value (array, object, primitive), or null if
   * nothing parseable is found.
   */
  private extractJsonValue(text: string): unknown | null {
    let s = (text ?? '').trim();
    if (!s) return null;

    // Strip a surrounding markdown fence: ```json\n...\n``` or ```\n...\n```
    const fence = s.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
    if (fence && fence[1]) {
      s = fence[1].trim();
    }

    // Fast path: the whole payload is already valid JSON (object OR array).
    // CRITICAL: must succeed for the object-root case so we do NOT walk into
    // a nested `redFlags` array and misread it as the signal list.
    try {
      return JSON.parse(s);
    } catch {
      // fall through to balanced scan
    }

    // If the body starts with '{' prefer a brace-balanced scan; otherwise
    // try bracket-balanced. If neither candidate is found, fall back to
    // whichever delimiter appears first in the string.
    const firstBrace = s.indexOf('{');
    const firstBracket = s.indexOf('[');

    const tryScan = (
      start: number,
      open: '{' | '['
    ): unknown | null => {
      if (start === -1) return null;
      const close = open === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (inString) {
          if (c === '\\') escaped = true;
          else if (c === '"') inString = false;
          continue;
        }
        if (c === '"') {
          inString = true;
          continue;
        }
        if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) {
            const slice = s.slice(start, i + 1);
            try {
              return JSON.parse(slice);
            } catch {
              return null;
            }
          }
        }
      }
      return null;
    };

    // Prefer whichever delimiter appears first - if the model returned
    // `{...}` with prose wrappers, we must NOT walk into a nested array
    // and misread it as the signals list.
    const candidates: Array<['{' | '[', number]> = [];
    if (firstBrace !== -1) candidates.push(['{', firstBrace]);
    if (firstBracket !== -1) candidates.push(['[', firstBracket]);
    candidates.sort((a, b) => a[1] - b[1]);

    for (const [open, start] of candidates) {
      const parsed = tryScan(start, open);
      if (parsed !== null) return parsed;
    }

    return null;
  }

  /**
   * Map a single raw signal-like object from the AI response into an
   * AnalysisSignal. Tolerates missing fields.
   */
  private mapSignal(
    raw: Record<string, unknown>,
    provider: string,
    extraEvidence: Record<string, unknown> = {}
  ): AnalysisSignal {
    const confidenceNum = typeof raw['confidence'] === 'number' ? raw['confidence'] : 0.5;
    return {
      analyzerName: 'AI',
      signalType:
        (typeof raw['signalType'] === 'string' ? raw['signalType'] : undefined) ||
        'unknown',
      severity: this.normalizeSeverity(raw['severity']),
      confidence: Math.max(0, Math.min(1, confidenceNum || 0.5)),
      description:
        (typeof raw['description'] === 'string' ? raw['description'] : undefined) ||
        'No description provided',
      evidence: {
        provider,
        rawSignal: raw,
        ...extraEvidence,
      },
    } as AnalysisSignal;
  }

  /**
   * Coerce a parsed JSON value into an AnalysisSignal[]. Accepts:
   * - Array of signal objects (the standard contract)
   * - Single signal object (wrapped into an array)
   * - "Verdict object" shape { verdict, redFlags, reasoning, confidence, score, actions }
   *   synthesized into one signal per red flag plus a terminal final_verdict signal
   * Anything else returns an empty array with a parseError.
   */
  private coerceSignalsFromJson(
    parsed: unknown,
    provider: string,
    input: NormalizedInput
  ): ParseResult {
    const extraEvidence = { inputType: input.type };

    // Array of signal objects - the happy path.
    if (Array.isArray(parsed)) {
      const signals: AnalysisSignal[] = [];
      for (const item of parsed) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          signals.push(this.mapSignal(item as Record<string, unknown>, provider, extraEvidence));
        }
      }
      if (signals.length === 0) {
        return {
          signals: [],
          parseError: { message: 'JSON array contained no signal objects' },
        };
      }
      return { signals, parseError: null };
    }

    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;

      // Single-signal-object shape: has signalType / severity / description.
      const looksLikeSignal =
        typeof obj['signalType'] === 'string' ||
        typeof obj['severity'] === 'string' ||
        typeof obj['description'] === 'string';

      const hasVerdictFields =
        'verdict' in obj ||
        'redFlags' in obj ||
        'reasoning' in obj ||
        'score' in obj ||
        'actions' in obj;

      // Verdict-object shape: synthesize signals from redFlags + terminal.
      if (hasVerdictFields && !looksLikeSignal) {
        const signals: AnalysisSignal[] = [];
        const verdict =
          typeof obj['verdict'] === 'string' ? (obj['verdict'] as string) : 'Unknown';
        const confidenceRaw =
          typeof obj['confidence'] === 'number' ? (obj['confidence'] as number) : 0.5;
        const confidence = Math.max(0, Math.min(1, confidenceRaw || 0.5));
        const reasoning =
          typeof obj['reasoning'] === 'string' ? (obj['reasoning'] as string) : '';
        const actions = Array.isArray(obj['actions'])
          ? (obj['actions'] as unknown[]).filter((a): a is string => typeof a === 'string')
          : [];
        const redFlags = Array.isArray(obj['redFlags'])
          ? (obj['redFlags'] as unknown[])
          : [];

        for (const rf of redFlags) {
          if (typeof rf !== 'string' || rf.trim().length === 0) continue;
          signals.push(
            this.mapSignal(
              {
                signalType: 'ai_red_flag',
                severity: 'medium',
                confidence,
                description: rf,
              },
              provider,
              { ...extraEvidence, source: 'verdict_object' }
            )
          );
        }

        const verdictLower = verdict.toLowerCase();
        const verdictSeverity: SignalSeverity =
          verdictLower === 'malicious'
            ? 'high'
            : verdictLower === 'suspicious'
              ? 'medium'
              : verdictLower === 'safe'
                ? 'low'
                : 'medium';

        const parts: string[] = [`VERDICT: ${verdict}`];
        if (reasoning) parts.push(`\nTHREAT SUMMARY:\n${reasoning}`);
        if (redFlags.length > 0) {
          const rfList = redFlags
            .filter((r): r is string => typeof r === 'string')
            .map((r) => `- ${r}`)
            .join('\n');
          if (rfList) parts.push(`\nPRIMARY INDICATORS:\n${rfList}`);
        }
        if (actions.length > 0) {
          parts.push(`\nRECOMMENDED ACTION:\n${actions.map((a) => `- ${a}`).join('\n')}`);
        }

        signals.push(
          this.mapSignal(
            {
              signalType: 'final_verdict',
              severity: verdictSeverity,
              confidence,
              description: parts.join('\n'),
            },
            provider,
            { ...extraEvidence, source: 'verdict_object', verdict, actions }
          )
        );

        return { signals, parseError: null };
      }

      // Single signal object - wrap into a one-element array.
      if (looksLikeSignal) {
        return {
          signals: [this.mapSignal(obj, provider, extraEvidence)],
          parseError: null,
        };
      }

      return {
        signals: [],
        parseError: {
          message: 'JSON object is neither a signal, nor a verdict-shaped response',
        },
      };
    }

    return {
      signals: [],
      parseError: {
        message: `JSON value is not a signal container (got ${parsed === null ? 'null' : typeof parsed})`,
      },
    };
  }

  /**
   * Generic AI response parser. Returns signals + parseError so callers
   * can surface the exact parse failure into debug metadata.
   * Never throws - any unexpected error is converted to a parseError.
   */
  private parseAIResponse(
    responseText: string,
    _provider: string,
    input: NormalizedInput
  ): ParseResult {
    const parsed = this.extractJsonValue(responseText);
    if (parsed === null) {
      logger.warn({ msg: 'No JSON value found in AI response', provider: _provider });
      return {
        signals: [],
        parseError: { message: 'No JSON value found in AI response' },
      };
    }

    try {
      return this.coerceSignalsFromJson(parsed, _provider, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({
        msg: 'Unexpected error coercing AI response to signals',
        provider: _provider,
        error: message,
      });
      return {
        signals: [],
        parseError: { message: `coerce error: ${message}` },
      };
    }
  }

  /**
   * Truncate a string for storage in ai_metadata JSONB.
   * Adds a [truncated] marker when clipped.
   */
  private truncateString(value: string | undefined, maxBytes: number): string | undefined {
    if (value === undefined || value === null) return value;
    if (value.length <= maxBytes) return value;
    return value.slice(0, maxBytes) + '\n...[truncated]';
  }

  /**
   * Truncate a JSON-serializable value for storage. If stringified form
   * exceeds maxBytes, return a wrapper marker instead of the original.
   */
  private truncateForStorage(value: unknown, maxBytes: number): unknown {
    if (value === undefined || value === null) return value;
    try {
      const json = JSON.stringify(value);
      if (json.length <= maxBytes) return value;
      return {
        _truncated: true,
        preview: json.slice(0, maxBytes),
      };
    } catch {
      return { _truncated: true, preview: '[unserializable]' };
    }
  }

  /**
   * Remove secrets (API keys in query params) from a URL before storing.
   * Specifically targets Google's `?key=...` query param.
   */
  private sanitizeApiUrl(url: string): string {
    try {
      const u = new URL(url);
      if (u.searchParams.has('key')) {
        u.searchParams.set('key', '[redacted]');
      }
      return u.toString();
    } catch {
      return url.replace(/([?&]key=)[^&]+/gi, '$1[redacted]');
    }
  }

  /**
   * Fallback: Re-query AI to convert unstructured response to JSON
   * Used when initial parsing fails
   */
  private async fallbackReparse(
    originalResponse: string,
    config: AIProviderConfig
  ): Promise<ParseResult> {
    logger.warn({
      msg: 'Attempting fallback re-parsing - sending response back to AI for JSON conversion',
      provider: config.provider,
      originalResponseLength: originalResponse.length,
    });

    try {
      const reparsePrompt = `Convert the following analysis to the required JSON format.

Original analysis:
${originalResponse.substring(0, 3000)}

Required JSON format:
[
  {
    "signalType": "string (e.g., suspicious_sender, phishing_keywords, etc.)",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "string"
  },
  {
    "signalType": "final_verdict",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "VERDICT: [Safe|Suspicious|Malicious]\\n\\n[Summary of analysis]"
  }
]

Extract the key findings and convert to JSON. Response MUST be valid JSON array.`;

      // Make second API call
      let reparseResponse: string;
      switch (config.provider.toLowerCase()) {
        case 'anthropic':
          const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: config.model,
              max_tokens: config.maxTokens || 2000,
              messages: [{ role: 'user', content: reparsePrompt }],
            }),
          });
          const anthropicData: any = await anthropicResponse.json();
          reparseResponse = anthropicData.content[0].text;
          break;

        case 'openai':
          const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model: config.model,
              messages: [{ role: 'user', content: reparsePrompt }],
              max_tokens: config.maxTokens || 2000,
            }),
          });
          const openaiData: any = await openaiResponse.json();
          reparseResponse = openaiData.choices[0].message.content;
          break;

        default:
          throw new Error(`Fallback re-parsing not supported for provider: ${config.provider}`);
      }

      logger.info({
        msg: 'Fallback re-parsing response received',
        provider: config.provider,
        reparseResponseLength: reparseResponse.length,
      });

      // Try parsing the re-parsed response using the same shape-agnostic extractor
      const parsed = this.extractJsonValue(reparseResponse);
      if (parsed === null) {
        logger.error({
          msg: 'Fallback re-parsing also failed to produce valid JSON',
          provider: config.provider,
        });
        return {
          signals: [],
          parseError: { message: 'Fallback re-parse produced no JSON value' },
        };
      }

      try {
        // Synthesize a NormalizedInput-like stub just for inputType evidence.
        // We do not have the original input here; mark as 'reparse'.
        const stubInput = { type: 'reparse' as unknown as NormalizedInput['type'] } as NormalizedInput;
        const result = this.coerceSignalsFromJson(parsed, config.provider, stubInput);
        if (result.signals.length > 0) {
          // Tag each signal's evidence as a fallback-reparse result.
          for (const s of result.signals) {
            s.evidence = { ...(s.evidence || {}), fallbackReparse: true };
          }
          logger.info({
            msg: 'Fallback re-parsing successful',
            provider: config.provider,
            signalCount: result.signals.length,
          });
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          signals: [],
          parseError: { message: `fallback coerce error: ${message}` },
        };
      }
    } catch (error) {
      logger.error({
        msg: 'Fallback re-parsing failed completely',
        provider: config.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        signals: [],
        parseError: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Normalize severity to standard levels.
   * Accepts `unknown` as defense-in-depth: if a future AI shape sneaks
   * through with a missing / non-string severity, we return 'medium'
   * rather than crashing the run with `toLowerCase of undefined`.
   */
  private normalizeSeverity(severity: unknown): SignalSeverity {
    if (typeof severity !== 'string') return 'medium';
    const normalized = severity.toLowerCase();
    if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
      return normalized as SignalSeverity;
    }
    return 'medium';
  }

  /**
   * Calculate cost based on provider and token usage
   */
  private calculateCost(
    _provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    // Pricing as of 2025 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      // Anthropic
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },

      // OpenAI
      'gpt-4-turbo': { input: 10.0, output: 30.0 },
      'gpt-4': { input: 30.0, output: 60.0 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },

      // Google
      'gemini-1.5-pro': { input: 3.5, output: 10.5 },
      'gemini-1.5-flash': { input: 0.35, output: 1.05 },
    };

    const modelPricing = pricing[model] || { input: 1.0, output: 2.0 };

    const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
    const outputCost = (completionTokens / 1_000_000) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Extract detailed error information from fetch failures
   * Captures error.cause chain, system error codes, and provides user-friendly messages
   */
  private extractFetchErrorDetails(
    error: unknown,
    url: string,
    config: AIProviderConfig
  ): {
    provider: string;
    model: string;
    apiUrl: string;
    errorMessage: string;
    errorCode?: string;
    errorCause?: string;
    errorDetails?: any;
    userMessage: string;
  } {
    const details: any = {
      provider: config.provider,
      model: config.model,
      apiUrl: url,
      errorMessage: error instanceof Error ? error.message : String(error),
    };

    // Extract Node.js system error details
    if (error instanceof Error) {
      const cause = (error as any).cause;
      if (cause) {
        details.errorCode = cause.code;
        details.errorCause = cause.message;
        details.errorDetails = {
          errno: cause.errno,
          syscall: cause.syscall,
          hostname: cause.hostname,
        };
      }

      // Also capture stack trace for debugging
      details.stack = error.stack;
    }

    // Generate user-friendly error message based on error type
    details.userMessage = this.getUserFriendlyErrorMessage(
      details.errorCode,
      details.errorCause,
      details.errorMessage, // Pass original error message as fallback
      config
    );

    return details;
  }

  /**
   * Convert system error codes to user-friendly messages
   */
  private getUserFriendlyErrorMessage(
    code: string | undefined,
    cause: string | undefined,
    errorMessage: string | undefined,
    config: AIProviderConfig
  ): string {
    // Check for certificate errors in cause message (when no specific error code)
    if (cause && (cause.includes('certificate') || cause.includes('self-signed') || cause.includes('SSL'))) {
      return `SSL certificate error: ${cause}. This usually means you're behind a corporate proxy with a self-signed certificate. To fix: Configure NODE_EXTRA_CA_CERTS environment variable with your corporate CA certificate. See docs/development/SSL_CONFIGURATION.md for detailed instructions.`;
    }

    if (!code) {
      // Use cause if available, otherwise use the original error message
      return cause || errorMessage || 'Unknown error occurred';
    }

    switch (code) {
      case 'ENOTFOUND':
        return `DNS resolution failed - cannot find ${config.provider} API server`;

      case 'ECONNREFUSED':
        return `Connection refused - ${config.provider} API server is not responding`;

      case 'ETIMEDOUT':
      case 'ABORT_ERR':
        return `Request timed out after ${config.timeout || 30000}ms`;

      case 'EPROTO':
      case 'CERT_HAS_EXPIRED':
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      case 'SELF_SIGNED_CERT_IN_CHAIN':
        return `SSL/TLS certificate error: ${cause || 'Certificate validation failed'}. This usually means you're behind a corporate proxy with a self-signed certificate. To fix: Configure NODE_EXTRA_CA_CERTS environment variable with your corporate CA certificate. See docs/development/SSL_CONFIGURATION.md for detailed instructions.`;

      case 'ENETUNREACH':
      case 'EHOSTUNREACH':
        return 'Network unreachable - check internet connection';

      case 'ECONNRESET':
        return 'Connection reset by server';

      default:
        return cause || `Network error: ${code}`;
    }
  }
}

/**
 * Singleton instance
 */
let aiExecutionServiceInstance: AIExecutionService | null = null;

/**
 * Get AI Execution Service instance
 */
export function getAIExecutionService(): AIExecutionService {
  if (!aiExecutionServiceInstance) {
    aiExecutionServiceInstance = new AIExecutionService();
  }
  return aiExecutionServiceInstance;
}

/**
 * Reset service (for testing)
 */
export function resetAIExecutionService(): void {
  aiExecutionServiceInstance = null;
}
