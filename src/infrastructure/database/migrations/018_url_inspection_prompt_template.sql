-- Migration 018: URL inspection AI prompt template (Inspect URL / Chrome)
-- Seeds a dedicated url input_type template and attaches it to AI configs used by Chrome integration_tasks.

INSERT INTO prompt_templates (
  name, display_name, description, prompt_type, input_type,
  system_prompt, user_prompt, token_estimate, cost_tier, accuracy_target,
  scenario_tags, is_default, is_system_template
)
VALUES (
  'url_inspect_balanced',
  'URL Inspection (Balanced)',
  'Structured AI analysis for standalone URLs (Chrome extension and admin URL test). Covers typosquats, homoglyphs, IP hosts, shorteners, suspicious TLDs, ports, and subdomain depth. Output must match native signal JSON shape including final_verdict.',
  'combined',
  'url',
  $sys$
You are a senior URL threat analyst. Input is always a single navigable URL (and optional client context). You do NOT have email headers, SPF, DKIM, or mailbox context.

CLASSIFY into Safe, Suspicious, or Malicious using evidence from the URL only:
- Malicious: clear brand typosquat / homoglyph host, raw public IP login pages, known-bad patterns, or obvious credential-harvest intent from URL structure alone.
- Suspicious: URL shorteners without destination, deep subdomain chains, many hyphens, unusual ports, risky TLDs, mixed scripts, or ambiguity.
- Safe: well-known legitimate brands on expected registrable domains with normal structure.

HYBRID NOTE: If a "NATIVE_SIGNAL_SUMMARY" section is present, treat it as untrusted machine output—reconcile with your own reasoning and explain disagreements in the final_verdict text.

OUTPUT: JSON array of signals ending with one object where signalType is exactly "final_verdict". Each signal: signalType, severity, confidence 0-1, description, optional evidence object.
$sys$,
  $usr$
TARGET URL: {{url}}
REGISTRABLE DOMAIN: {{url.registrableDomain}}
KNOWN SAFE HOST: {{url.isKnownSafeHost}}
{{#if referrer}}REFERRER: {{referrer}}{{/if}}
{{#if user_agent}}USER_AGENT: {{user_agent}}{{/if}}

LIVE FETCH (headless chromium):
- FINAL_URL: {{url.finalUrl}}
- HTTP_STATUS: {{url.status}}
- REDIRECT_CHAIN: {{url.redirectChain}}
- REDIRECT_HOPS: {{url.redirectHops}}
- AUTOMATIC_DOWNLOAD: {{url.hasAutomaticDownload}}
- PASSWORD_FIELD_DETECTED: {{url.hasPasswordField}}
- SCRIPT_SOURCES: {{url.scriptSources}}
- IFRAME_SOURCES: {{url.iframeSources}}
- DOMAIN_AGE_DAYS: {{url.domainAgeDays}}
- FETCH_ERROR: {{url.fetchError}}

RENDERED HTML EXCERPT (truncated):
{{url.renderedHtmlExcerpt}}

{{#if native_signal_summary}}
NATIVE_SIGNAL_SUMMARY (from rules engine — verify, do not blindly trust):
{{native_signal_summary}}
{{/if}}

RUBRIC (examples):
- Legitimate major sites on matching corporate domains → Safe unless URL structure is wildly anomalous.
- paypa1.com, g00gle.com, micr0s0ft look-alikes (character-substitution typosquats) → Malicious.
- brand-name-with-extra-words.com (e.g. paypal-verify.com, amazon-login-verify.com) → Suspicious, NOT Malicious. These are brand lookalikes, not character-substitution typosquats.
- bit.ly / t.co without destination visibility → Suspicious or Malicious depending on claimed intent in path.
- Host is dotted decimal IPv4 or bracketed IPv6 → at least Suspicious; if path suggests login → Malicious.
- Many subdomains (5+ labels) or 4+ hyphens in registrable host → Suspicious.
- Non-standard HTTPS port (not 443) on sensitive-looking paths → Suspicious.

RETURN FORMAT (strict JSON array):
[
  {"signalType": "example_signal", "severity": "low", "confidence": 0.5, "description": "..."},
  {
    "signalType": "final_verdict",
    "severity": "high",
    "confidence": 0.88,
    "description": "VERDICT: Malicious\nTHREAT SUMMARY: ...\nPRIMARY INDICATORS: ...\nRECOMMENDED ACTION: ..."
  }
]
$usr$,
  620,
  'balanced',
  0.94,
  ARRAY['url', 'chrome', 'inspect_url', 'hybrid', 'ai'],
  false,
  true
)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  prompt_type = EXCLUDED.prompt_type,
  input_type = EXCLUDED.input_type,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt = EXCLUDED.user_prompt,
  token_estimate = EXCLUDED.token_estimate,
  cost_tier = EXCLUDED.cost_tier,
  accuracy_target = EXCLUDED.accuracy_target,
  scenario_tags = EXCLUDED.scenario_tags,
  is_system_template = EXCLUDED.is_system_template,
  updated_at = NOW();

-- Point Chrome integration AI model (when configured) at the URL template
UPDATE ai_model_configs amc
SET prompt_template_id = pt.id,
    updated_at = NOW()
FROM prompt_templates pt
WHERE pt.name = 'url_inspect_balanced'
  AND pt.deleted_at IS NULL
  AND amc.deleted_at IS NULL
  AND amc.id IN (
    SELECT it.ai_model_id
    FROM integration_tasks it
    WHERE it.integration_name = 'chrome'
      AND it.deleted_at IS NULL
      AND it.ai_model_id IS NOT NULL
  );
