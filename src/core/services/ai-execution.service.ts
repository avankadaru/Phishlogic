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
import { getLogger } from '../../infrastructure/logging/logger.js';

const logger = getLogger();

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
    config: AIProviderConfig
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
    });

    try {
      // Call appropriate provider
      const response = await this.callProvider(input, config);

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
  private async callProvider(input: NormalizedInput, config: AIProviderConfig): Promise<AIResponse> {
    switch (config.provider.toLowerCase()) {
      case 'anthropic':
        return await this.callAnthropic(input, config);
      case 'openai':
        return await this.callOpenAI(input, config);
      case 'google':
        return await this.callGoogle(input, config);
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(input: NormalizedInput, config: AIProviderConfig): Promise<AIResponse> {
    const prompt = this.buildPrompt(input);
    const startTime = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
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
    const signals = this.parseAnthropicResponse(data.content[0].text, input);

    return {
      signals,
      metadata: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        latencyMs,
      },
    };
  }

  /**
   * Call OpenAI GPT API
   */
  private async callOpenAI(input: NormalizedInput, config: AIProviderConfig): Promise<AIResponse> {
    const prompt = this.buildPrompt(input);
    const startTime = Date.now();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens || 4096,
        temperature: config.temperature || 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are a phishing detection expert. Analyze the provided content and identify security signals.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
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
    const signals = this.parseOpenAIResponse(data.choices[0].message.content, input);

    return {
      signals,
      metadata: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        latencyMs,
      },
    };
  }

  /**
   * Call Google Gemini API
   */
  private async callGoogle(input: NormalizedInput, config: AIProviderConfig): Promise<AIResponse> {
    const prompt = this.buildPrompt(input);
    const startTime = Date.now();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${config.model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: config.temperature || 0.7,
            maxOutputTokens: config.maxTokens || 4096,
          },
        }),
        signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    const latencyMs = Date.now() - startTime;

    // Parse response to signals
    const signals = this.parseGoogleResponse(data.candidates[0].content.parts[0].text, input);

    return {
      signals,
      metadata: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
        latencyMs,
      },
    };
  }

  /**
   * Build analysis prompt for AI
   */
  private buildPrompt(input: NormalizedInput): string {
    if (isEmailInput(input)) {
      return `Analyze this email for phishing indicators. Return a JSON array of security signals.

Email Content:
From: ${input.data.parsed?.from?.address || 'unknown'}
Subject: ${input.data.parsed?.subject || 'unknown'}
Body: ${input.data.parsed?.body?.text || input.data.parsed?.body?.html || 'empty'}
URLs: ${input.data.parsed?.urls?.join(', ') || 'none'}

Return format:
[
  {
    "signalType": "suspicious_sender|phishing_keywords|suspicious_url|urgent_language|...",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "Plain English explanation"
  }
]

Focus on: sender authenticity, urgency tactics, suspicious URLs, grammar issues, impersonation attempts.`;
    } else if (isUrlInput(input)) {
      // URL analysis
      return `Analyze this URL for phishing indicators. Return a JSON array of security signals.

URL: ${input.data.url}

Return format:
[
  {
    "signalType": "suspicious_domain|high_entropy_url|url_shortener|typosquatting|suspicious_tld|...",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "Plain English explanation"
  }
]

Focus on: domain reputation, entropy, typosquatting, suspicious TLDs, URL patterns.`;
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
