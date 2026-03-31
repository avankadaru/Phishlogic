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
}

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
      const { systemPrompt, userPrompt } = await this.buildPrompt(input, config, riskProfile);
      const startTime = Date.now();

      // Build messages array with optional system prompt
      const messages: any[] = [];
      if (systemPrompt) {
        messages.push({ role: 'user', content: systemPrompt });
        messages.push({ role: 'assistant', content: 'Understood. I will analyze according to these guidelines.' });
      }
      messages.push({ role: 'user', content: userPrompt });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature || 0.7,
          messages,
        }),
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;

      // Parse response to signals
      let signals = this.parseAnthropicResponse(data.content[0].text, input);

      // FALLBACK: If parsing failed (empty signals), try re-parsing
      if (signals.length === 0 && data.content[0].text.length > 0) {
        logger.warn({
          msg: 'Initial parsing produced zero signals - attempting fallback re-parse',
          provider: 'anthropic',
        });

        signals = await this.fallbackReparse(data.content[0].text, config);
      }

      return {
        signals,
        metadata: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          latencyMs,
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
      const { systemPrompt, userPrompt } = await this.buildPrompt(input, config, riskProfile);
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

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature || 0.7,
          messages,
        }),
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;

      // Parse response to signals
      let signals = this.parseOpenAIResponse(data.choices[0].message.content, input);

      // FALLBACK: If parsing failed (empty signals), try re-parsing
      if (signals.length === 0 && data.choices[0].message.content.length > 0) {
        logger.warn({
          msg: 'Initial parsing produced zero signals - attempting fallback re-parse',
          provider: 'openai',
        });

        signals = await this.fallbackReparse(data.choices[0].message.content, config);
      }

      return {
        signals,
        metadata: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          latencyMs,
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
      const { systemPrompt, userPrompt } = await this.buildPrompt(input, config, riskProfile);
      const startTime = Date.now();

      // Combine system and user prompts for Google (it doesn't have separate system prompts)
      const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${userPrompt}` : userPrompt;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: combinedPrompt }],
            },
          ],
          generationConfig: {
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.maxTokens || 4096,
          },
        }),
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      const latencyMs = Date.now() - startTime;

      // Parse response to signals
      let signals = this.parseGoogleResponse(data.candidates[0].content.parts[0].text, input);

      // FALLBACK: If parsing failed (empty signals), try re-parsing
      // Note: Google fallback not implemented in fallbackReparse method yet
      if (signals.length === 0 && data.candidates[0].content.parts[0].text.length > 0) {
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
   * Load prompt template from database
   */
  private async loadTemplate(templateId: string): Promise<PromptTemplate | null> {
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
        return null;
      }

      return result.rows[0] as PromptTemplate;
    } catch (error) {
      logger.error({ error, templateId }, 'Failed to load prompt template');
      return null;
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

      // Risk profile data
      if (riskProfile) {
        // Sender info
        if (riskProfile.sender) {
          vars['spf_status'] = riskProfile.sender.hasAuthentication?.spf || 'unknown';
          vars['dkim_status'] = riskProfile.sender.hasAuthentication?.dkim || 'unknown';
          vars['dmarc_status'] = riskProfile.sender.hasAuthentication?.dmarc || 'unknown';
          vars['is_role_account'] = riskProfile.sender.isRole;
          vars['is_disposable'] = riskProfile.sender.isDisposable;
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
    }

    return vars;
  }

  /**
   * Interpolate template with variables (simple Handlebars-like)
   */
  private interpolateTemplate(template: string, variables: Record<string, any>): string {
    let result = template;

    // Handle simple {{variable}} replacements
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
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
   */
  private async buildPrompt(
    input: NormalizedInput,
    config: AIProviderConfig,
    riskProfile?: EnhancedContentRiskProfile
  ): Promise<{ systemPrompt?: string; userPrompt: string }> {
    // Try to load template if specified
    if (config.promptTemplateId) {
      const template = await this.loadTemplate(config.promptTemplateId);
      if (template) {
        const variables = this.buildTemplateVariables(input, riskProfile);
        const userPrompt = this.interpolateTemplate(template.userPrompt, variables);
        const systemPrompt = template.systemPrompt
          ? this.interpolateTemplate(template.systemPrompt, variables)
          : undefined;

        logger.info({ templateId: config.promptTemplateId, templateName: template.name },
          'Using prompt template');

        return { systemPrompt, userPrompt };
      } else {
        logger.warn({ templateId: config.promptTemplateId },
          'Template not found, falling back to default prompt');
      }
    }

    // Fall back to legacy prompt generation
    const legacyPrompt = this.buildLegacyPrompt(input, riskProfile);
    return { userPrompt: legacyPrompt };
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
          prompt += `\n\nSender Profile:
- Email: ${riskProfile.sender.email} (${riskProfile.sender.domain})
- Display Name: ${riskProfile.sender.displayName || 'None'}
- Role Account: ${riskProfile.sender.isRole}
- Disposable Email: ${riskProfile.sender.isDisposable}
- Authentication: SPF=${riskProfile.sender.hasAuthentication.spf ?? 'unknown'}, DKIM=${riskProfile.sender.hasAuthentication.dkim ?? 'unknown'}`;
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
  private parseAnthropicResponse(responseText: string, input: NormalizedInput): AnalysisSignal[] {
    return this.parseAIResponse(responseText, 'anthropic', input);
  }

  /**
   * Parse OpenAI response to signals
   */
  private parseOpenAIResponse(responseText: string, input: NormalizedInput): AnalysisSignal[] {
    return this.parseAIResponse(responseText, 'openai', input);
  }

  /**
   * Parse Google response to signals
   */
  private parseGoogleResponse(responseText: string, input: NormalizedInput): AnalysisSignal[] {
    return this.parseAIResponse(responseText, 'google', input);
  }

  /**
   * Generic AI response parser
   */
  private parseAIResponse(responseText: string, _provider: string, input: NormalizedInput): AnalysisSignal[] {
    try {
      // Extract JSON array from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn({ msg: 'No JSON array found in AI response', provider: _provider });
        return [];
      }

      const rawSignals = JSON.parse(jsonMatch[0]);

      // Convert to AnalysisSignal format
      return rawSignals.map((signal: any) => ({
        analyzerName: 'AI',
        signalType: signal.signalType || 'unknown',
        severity: this.normalizeSeverity(signal.severity),
        confidence: Math.max(0, Math.min(1, signal.confidence || 0.5)),
        description: signal.description || 'No description provided',
        evidence: {
          provider: _provider,
          rawSignal: signal,
          inputType: input.type,
        },
      }));
    } catch (error) {
      logger.error({
        msg: 'Failed to parse AI response',
        provider: _provider,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return empty array on parse failure
      return [];
    }
  }

  /**
   * Fallback: Re-query AI to convert unstructured response to JSON
   * Used when initial parsing fails
   */
  private async fallbackReparse(
    originalResponse: string,
    config: AIProviderConfig
  ): Promise<AnalysisSignal[]> {
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

      // Try parsing the re-parsed response
      const jsonMatch = reparseResponse.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.error({
          msg: 'Fallback re-parsing also failed to produce valid JSON',
          provider: config.provider,
        });
        return [];
      }

      const rawSignals = JSON.parse(jsonMatch[0]);
      const signals = rawSignals.map((signal: any) => ({
        analyzerName: 'AI',
        signalType: signal.signalType || 'unknown',
        severity: this.normalizeSeverity(signal.severity),
        confidence: Math.max(0, Math.min(1, signal.confidence || 0.5)),
        description: signal.description || 'No description provided',
        evidence: {
          provider: config.provider,
          rawSignal: signal,
          fallbackReparse: true,
        },
      }));

      logger.info({
        msg: 'Fallback re-parsing successful',
        provider: config.provider,
        signalCount: signals.length,
      });

      return signals;
    } catch (error) {
      logger.error({
        msg: 'Fallback re-parsing failed completely',
        provider: config.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Normalize severity to standard levels
   */
  private normalizeSeverity(severity: string): SignalSeverity {
    const normalized = severity.toLowerCase();
    if (['critical', 'high', 'medium', 'low'].includes(normalized)) {
      return normalized as SignalSeverity;
    }
    return 'medium'; // Default to medium if unknown
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
