/**
 * Unit tests for the AI response parser (extractJsonValue, coerceSignalsFromJson,
 * and parseAIResponse) plus buildPrompt promptSource capture.
 *
 * These tests lock in the behavior that fixes:
 *   "Unexpected non-whitespace character after JSON at position X"
 *   "Cannot read properties of undefined (reading 'toLowerCase')"
 *
 * The parser must now handle both array-of-signals AND verdict-object
 * responses, synthesize signals from `redFlags`, and never crash when
 * `severity` is undefined.
 */

import { AIExecutionService } from '../../../src/core/services/ai-execution.service.js';
import type { NormalizedInput } from '../../../src/core/models/input.js';

describe('AIExecutionService - response parser', () => {
  const service = new AIExecutionService();
  const svc: any = service as any;
  const urlInput: NormalizedInput = {
    type: 'url',
    data: { url: 'https://example.com' },
  } as NormalizedInput;

  describe('extractJsonValue', () => {
    it('parses a clean JSON array', () => {
      const text = '[{"a":1},{"b":2}]';
      expect(svc.extractJsonValue(text)).toEqual([{ a: 1 }, { b: 2 }]);
    });

    it('parses a clean JSON object', () => {
      const text = '{"verdict":"Safe","redFlags":[]}';
      expect(svc.extractJsonValue(text)).toEqual({
        verdict: 'Safe',
        redFlags: [],
      });
    });

    it('strips surrounding ```json ... ``` markdown fence', () => {
      const body = '[{"a":1}]';
      const text = '```json\n' + body + '\n```';
      expect(svc.extractJsonValue(text)).toEqual([{ a: 1 }]);
    });

    it('strips an untagged ``` ... ``` markdown fence around an object', () => {
      const body = '{"verdict":"Suspicious"}';
      const text = '```\n' + body + '\n```';
      expect(svc.extractJsonValue(text)).toEqual({ verdict: 'Suspicious' });
    });

    it('handles prose before and after an array', () => {
      const body =
        '[{"signalType":"x","severity":"low","confidence":0.5,"description":"hi"}]';
      const text = `Here is the analysis:\n${body}\n\nThanks!`;
      expect(svc.extractJsonValue(text)).toEqual(JSON.parse(body));
    });

    it('handles prose before and after an object', () => {
      const body = '{"verdict":"Suspicious","redFlags":["a"]}';
      const text = `Here is the analysis:\n${body}\n\nThanks!`;
      expect(svc.extractJsonValue(text)).toEqual(JSON.parse(body));
    });

    it('prefers the outermost object and does not dig into nested arrays', () => {
      // Regression: previous extractor walked into nested `redFlags` and
      // returned only the array, dropping verdict/confidence/score/etc.
      const body =
        '{"verdict":"Suspicious","redFlags":["no spf","new domain"],"reasoning":"x"}';
      const text = `prose ${body} more prose`;
      const parsed = svc.extractJsonValue(text);
      expect(parsed).toEqual(JSON.parse(body));
      expect(Array.isArray(parsed)).toBe(false);
    });

    it('respects string contents containing brackets and escaped quotes', () => {
      // `]` does not need escaping inside a JSON string, but bracket-balanced
      // scanners must still recognize it as string content, not structural.
      const body = '[{"description":"quote \\" and bracket ] inside"}]';
      const parsed = svc.extractJsonValue(body);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].description).toContain('bracket ] inside');
    });

    it('returns null when no JSON is present', () => {
      expect(svc.extractJsonValue('no JSON here')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(svc.extractJsonValue('')).toBeNull();
      expect(svc.extractJsonValue('   ')).toBeNull();
    });
  });

  describe('normalizeSeverity (defense in depth)', () => {
    it('returns medium for undefined', () => {
      expect(svc.normalizeSeverity(undefined)).toBe('medium');
    });

    it('returns medium for null', () => {
      expect(svc.normalizeSeverity(null)).toBe('medium');
    });

    it('returns medium for non-string values', () => {
      expect(svc.normalizeSeverity(123)).toBe('medium');
      expect(svc.normalizeSeverity({})).toBe('medium');
      expect(svc.normalizeSeverity([])).toBe('medium');
    });

    it('lowercases known severities', () => {
      expect(svc.normalizeSeverity('HIGH')).toBe('high');
      expect(svc.normalizeSeverity('Medium')).toBe('medium');
      expect(svc.normalizeSeverity('low')).toBe('low');
      expect(svc.normalizeSeverity('Critical')).toBe('critical');
    });

    it('coerces unknown severities to medium', () => {
      expect(svc.normalizeSeverity('EXTREME')).toBe('medium');
      expect(svc.normalizeSeverity('bananas')).toBe('medium');
    });
  });

  describe('coerceSignalsFromJson - verdict object shape', () => {
    it('synthesizes ai_red_flag signals from redFlags plus a final_verdict signal', () => {
      // Exact shape that crashed production (analysis b9ba1aeb-...).
      const verdictObj = {
        verdict: 'Suspicious',
        confidence: 0.7,
        score: 7,
        redFlags: [
          'No SPF, DKIM, or DMARC authentication',
          'New domain less than 90 days old',
        ],
        reasoning: 'Email lacks proper authentication.',
        actions: ['Do not click on any links', 'Report to IT security team'],
      };

      const result = svc.coerceSignalsFromJson(verdictObj, 'openai', urlInput);

      expect(result.parseError).toBeNull();
      expect(result.signals.length).toBe(3); // 2 red flags + 1 final_verdict

      const redFlagSignals = result.signals.filter(
        (s: any) => s.signalType === 'ai_red_flag'
      );
      expect(redFlagSignals).toHaveLength(2);
      expect(redFlagSignals[0].severity).toBe('medium');
      expect(redFlagSignals[0].description).toBe(
        'No SPF, DKIM, or DMARC authentication'
      );

      const finalVerdict = result.signals.find(
        (s: any) => s.signalType === 'final_verdict'
      );
      expect(finalVerdict).toBeDefined();
      expect(finalVerdict.severity).toBe('medium'); // Suspicious -> medium
      expect(finalVerdict.description).toContain('VERDICT: Suspicious');
      expect(finalVerdict.description).toContain('PRIMARY INDICATORS');
      expect(finalVerdict.description).toContain('No SPF, DKIM, or DMARC authentication');
      expect(finalVerdict.description).toContain('RECOMMENDED ACTION');
    });

    it('maps Malicious verdict to high severity', () => {
      const r = svc.coerceSignalsFromJson(
        { verdict: 'Malicious', redFlags: ['x'], confidence: 0.9 },
        'openai',
        urlInput
      );
      const fv = r.signals.find((s: any) => s.signalType === 'final_verdict');
      expect(fv.severity).toBe('high');
    });

    it('maps Safe verdict to low severity', () => {
      const r = svc.coerceSignalsFromJson(
        { verdict: 'Safe', redFlags: [], confidence: 0.9 },
        'openai',
        urlInput
      );
      const fv = r.signals.find((s: any) => s.signalType === 'final_verdict');
      expect(fv.severity).toBe('low');
    });

    it('tolerates verdict object with no redFlags', () => {
      const r = svc.coerceSignalsFromJson(
        { verdict: 'Safe', confidence: 0.95, reasoning: 'all good' },
        'openai',
        urlInput
      );
      expect(r.parseError).toBeNull();
      expect(r.signals).toHaveLength(1); // just the final_verdict
      expect(r.signals[0].signalType).toBe('final_verdict');
    });
  });

  describe('coerceSignalsFromJson - array shape', () => {
    it('maps each object into a mapped signal', () => {
      const r = svc.coerceSignalsFromJson(
        [
          {
            signalType: 'suspicious_url',
            severity: 'high',
            confidence: 0.9,
            description: 'd',
          },
        ],
        'openai',
        urlInput
      );
      expect(r.parseError).toBeNull();
      expect(r.signals).toHaveLength(1);
      expect(r.signals[0].signalType).toBe('suspicious_url');
    });

    it('returns parseError when the array contains no objects', () => {
      const r = svc.coerceSignalsFromJson(['just', 'strings'], 'openai', urlInput);
      expect(r.signals).toEqual([]);
      expect(r.parseError).not.toBeNull();
    });
  });

  describe('coerceSignalsFromJson - single signal object', () => {
    it('wraps a single signal-shaped object into one-element array', () => {
      const r = svc.coerceSignalsFromJson(
        {
          signalType: 'suspicious_sender',
          severity: 'medium',
          confidence: 0.6,
          description: 'd',
        },
        'openai',
        urlInput
      );
      expect(r.signals).toHaveLength(1);
      expect(r.signals[0].signalType).toBe('suspicious_sender');
    });
  });

  describe('parseAIResponse', () => {
    it('parses array-of-signals cleanly', () => {
      const text =
        '[{"signalType":"suspicious_url","severity":"high","confidence":0.9,"description":"d"}]';
      const result = svc.parseAIResponse(text, 'openai', urlInput);
      expect(result.parseError).toBeNull();
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0]).toMatchObject({
        analyzerName: 'AI',
        signalType: 'suspicious_url',
        severity: 'high',
      });
    });

    it('parses the production verdict-object shape without crashing', () => {
      // Exact content string from analysis b9ba1aeb-6835-40eb-acef-2d3250e5ce3d.
      const content =
        '{\n' +
        '  "verdict": "Suspicious",\n' +
        '  "confidence": 0.7,\n' +
        '  "score": 7,\n' +
        '  "redFlags": [\n' +
        '    "No SPF, DKIM, or DMARC authentication",\n' +
        '    "New domain less than 90 days old"\n' +
        '  ],\n' +
        '  "reasoning": "Email lacks proper authentication.",\n' +
        '  "actions": ["Do not click on any links"]\n' +
        '}';
      const result = svc.parseAIResponse(content, 'openai', urlInput);
      expect(result.parseError).toBeNull();
      expect(result.signals.length).toBeGreaterThan(0);
      // Must NEVER produce a signal with undefined severity.
      for (const s of result.signals) {
        expect(['critical', 'high', 'medium', 'low']).toContain(s.severity);
      }
    });

    it('parses markdown-fenced verdict object', () => {
      const content =
        '```json\n{"verdict":"Safe","redFlags":[],"confidence":0.95}\n```';
      const result = svc.parseAIResponse(content, 'openai', urlInput);
      expect(result.parseError).toBeNull();
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].signalType).toBe('final_verdict');
      expect(result.signals[0].severity).toBe('low');
    });

    it('parses responses wrapped in a ```json fence (array)', () => {
      const body =
        '[{"signalType":"urgent_language","severity":"medium","confidence":0.7,"description":"urgent"}]';
      const text = '```json\n' + body + '\n```';
      const result = svc.parseAIResponse(text, 'openai', urlInput);
      expect(result.parseError).toBeNull();
      expect(result.signals).toHaveLength(1);
    });

    it('never throws on signals missing severity field (defense in depth)', () => {
      const text = '[{"signalType":"x","description":"no severity!"}]';
      const result = svc.parseAIResponse(text, 'openai', urlInput);
      expect(result.parseError).toBeNull();
      expect(result.signals[0].severity).toBe('medium');
    });

    it('returns parseError when no JSON found', () => {
      const result = svc.parseAIResponse('sorry, no JSON today', 'openai', urlInput);
      expect(result.signals).toEqual([]);
      expect(result.parseError).not.toBeNull();
    });

    it('returns parseError for a malformed truncated value', () => {
      const result = svc.parseAIResponse('[', 'openai', urlInput);
      expect(result.signals).toEqual([]);
      expect(result.parseError).not.toBeNull();
    });

    it('normalizes unknown severity to medium and clamps confidence', () => {
      const text =
        '[{"signalType":"x","severity":"EXTREME","confidence":2.5,"description":"d"}]';
      const result = svc.parseAIResponse(text, 'openai', urlInput);
      expect(result.signals[0].severity).toBe('medium');
      expect(result.signals[0].confidence).toBe(1);
    });
  });

  describe('sanitizeApiUrl', () => {
    it('redacts key= query params (Google API)', () => {
      const url =
        'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=SECRET123';
      const sanitized = svc.sanitizeApiUrl(url);
      expect(sanitized).not.toContain('SECRET123');
      expect(sanitized).toContain('key=%5Bredacted%5D');
    });

    it('leaves non-Google URLs unchanged', () => {
      const url = 'https://api.openai.com/v1/chat/completions';
      expect(svc.sanitizeApiUrl(url)).toBe(url);
    });
  });

  describe('truncateString', () => {
    it('returns input unchanged when below limit', () => {
      expect(svc.truncateString('hello', 100)).toBe('hello');
    });

    it('truncates and marks when above limit', () => {
      const input = 'x'.repeat(200);
      const out = svc.truncateString(input, 50);
      expect(out.startsWith('x'.repeat(50))).toBe(true);
      expect(out).toContain('[truncated]');
    });

    it('passes through undefined', () => {
      expect(svc.truncateString(undefined, 10)).toBeUndefined();
    });
  });

  describe('truncateForStorage', () => {
    it('returns the value unchanged when serialized form is small', () => {
      const v = { a: 1, b: [1, 2, 3] };
      expect(svc.truncateForStorage(v, 1000)).toBe(v);
    });

    it('wraps with _truncated marker when too large', () => {
      const big = { data: 'x'.repeat(5000) };
      const out: any = svc.truncateForStorage(big, 100);
      expect(out._truncated).toBe(true);
      expect(typeof out.preview).toBe('string');
      expect(out.preview.length).toBeLessThanOrEqual(100);
    });
  });
});

describe('AIExecutionService - buildPrompt promptSource', () => {
  const service = new AIExecutionService();
  const svc: any = service as any;
  const urlInput: NormalizedInput = {
    type: 'url',
    data: { url: 'https://example.com' },
  } as NormalizedInput;

  it('reports promptSource=legacy with no_template_id when no template id configured', async () => {
    const out = await svc.buildPrompt(urlInput, {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'sk-test',
      integrationName: 'email_inbox',
    });
    expect(out.promptSource).toEqual({
      type: 'legacy',
      reason: 'no_template_id',
    });
    expect(typeof out.userPrompt).toBe('string');
    expect(out.userPrompt.length).toBeGreaterThan(0);
  });

  it('reports promptSource=legacy with template_not_found when template id is missing in DB', async () => {
    // Force loadTemplate to say not_found
    const loadSpy = jest
      .spyOn(svc, 'loadTemplate')
      .mockResolvedValueOnce({ ok: false, reason: 'not_found' });

    const out = await svc.buildPrompt(urlInput, {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'sk-test',
      promptTemplateId: 'missing-template-id',
      aiModelId: 'ai-1',
      integrationName: 'email_inbox',
    });

    expect(out.promptSource).toMatchObject({
      type: 'legacy',
      reason: 'template_not_found',
      templateId: 'missing-template-id',
    });
    loadSpy.mockRestore();
  });

  it('reports promptSource=template with id and name when template is loaded', async () => {
    const fakeTemplate = {
      id: 'tpl-1',
      name: 'hybrid_balanced',
      description: 'Test template',
      systemPrompt: 'You are a security analyst.',
      userPrompt: 'Analyze {{input_type}}.',
      variables: [],
    };
    const loadSpy = jest
      .spyOn(svc, 'loadTemplate')
      .mockResolvedValueOnce({ ok: true, template: fakeTemplate });
    // buildTemplateVariables is called inside; stub a minimal return so
    // renderTemplate can succeed without full signal context.
    const varsSpy = jest
      .spyOn(svc, 'buildTemplateVariables')
      .mockReturnValueOnce({ input_type: 'url' });

    const out = await svc.buildPrompt(urlInput, {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'sk-test',
      promptTemplateId: 'tpl-1',
      aiModelId: 'ai-1',
      integrationName: 'email_inbox',
    });

    expect(out.promptSource).toEqual({
      type: 'template',
      id: 'tpl-1',
      name: 'hybrid_balanced',
    });
    expect(out.systemPrompt).toBe('You are a security analyst.');
    expect(out.userPrompt).toContain('Analyze url');

    loadSpy.mockRestore();
    varsSpy.mockRestore();
  });
});

describe('AIExecutionService - capture of raw request and response', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('populates apiRequest, apiResponse, rawContent, parseError, fallbackReparseUsed and promptSource for OpenAI', async () => {
    const cannedRaw =
      '[{"signalType":"suspicious_url","severity":"high","confidence":0.9,"description":"bad link"}]';
    const cannedResponse = {
      choices: [{ message: { content: cannedRaw } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify(cannedResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as any;

    const service = new AIExecutionService();
    const input: NormalizedInput = {
      type: 'url',
      id: 'test-1',
      timestamp: new Date(),
      data: { url: 'https://example.com' },
    };

    const { signals, metadata } = await service.executeWithAI(input, {
      provider: 'openai',
      model: 'gpt-4-turbo',
      apiKey: 'sk-test-SECRET-KEY',
      temperature: 0.2,
      maxTokens: 1024,
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.signalType).toBe('suspicious_url');

    expect(metadata.provider).toBe('openai');
    expect(metadata.model).toBe('gpt-4-turbo');
    expect(metadata.tokens.total).toBe(150);

    expect(metadata.apiUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(metadata.apiRequest).toBeDefined();
    const req = metadata.apiRequest as any;
    expect(req.model).toBe('gpt-4-turbo');
    expect(req.messages).toBeDefined();
    expect(Array.isArray(req.messages)).toBe(true);

    expect(metadata.apiResponse).toEqual(cannedResponse);
    expect(metadata.rawContent).toBe(cannedRaw);
    expect(metadata.parseError).toBeNull();
    expect(metadata.fallbackReparseUsed).toBe(false);

    // promptSource must be captured. Without a template id configured the
    // service falls back to the legacy prompt — surface that clearly.
    expect(metadata.promptSource).toBeDefined();
    expect((metadata.promptSource as any).type).toBe('legacy');
    expect((metadata.promptSource as any).reason).toBe('no_template_id');

    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('sk-test-SECRET-KEY');
  });

  it('does NOT crash on verdict-object AI output (regression: undefined toLowerCase)', async () => {
    const cannedRaw =
      '{"verdict":"Suspicious","confidence":0.7,"score":7,"redFlags":["No SPF","New domain"],"reasoning":"x","actions":["Do not click"]}';
    const cannedResponse = {
      choices: [{ message: { content: cannedRaw } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };

    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify(cannedResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as any;

    const service = new AIExecutionService();
    const input: NormalizedInput = {
      type: 'url',
      id: 'test-verdict',
      timestamp: new Date(),
      data: { url: 'https://example.com' },
    };

    const { signals, metadata } = await service.executeWithAI(input, {
      provider: 'openai',
      model: 'gpt-4-0613',
      apiKey: 'sk-test',
    });

    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(['critical', 'high', 'medium', 'low']).toContain(s.severity);
    }
    expect(metadata.parseError).toBeNull();
    expect(metadata.fallbackReparseUsed).toBe(false);
  });
});
