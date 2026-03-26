-- ============================================================================
-- PhishLogic - World-Class AI Prompt Templates System
-- ============================================================================
-- Migration: 015_prompt_templates
-- Purpose: Add configurable AI prompt templates for comprehensive phishing detection
--
-- Changes:
-- 1. Create prompt_templates table for storing reusable AI prompts
-- 2. Seed 3 world-class prompt templates (Cost-Efficient, Hybrid Balanced, Comprehensive)
-- 3. Add prompt_template_id to ai_model_configs for template assignment
-- 4. Add indexes for performance optimization
-- ============================================================================

-- Step 1: Create prompt_templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  prompt_type VARCHAR(50) NOT NULL CHECK (prompt_type IN ('system', 'user', 'combined')),
  input_type VARCHAR(50) NOT NULL CHECK (input_type IN ('email', 'url', 'both')),
  system_prompt TEXT,
  user_prompt TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  cost_tier VARCHAR(50) NOT NULL CHECK (cost_tier IN ('cost_efficient', 'balanced', 'comprehensive')),
  accuracy_target DECIMAL(4,2),
  scenario_tags VARCHAR(100)[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  is_system_template BOOLEAN DEFAULT false,
  created_by VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

COMMENT ON TABLE prompt_templates IS 'AI prompt templates for configurable phishing detection - balance accuracy, cost, and speed';
COMMENT ON COLUMN prompt_templates.name IS 'Unique identifier for the template (e.g., "cost_efficient_rapid")';
COMMENT ON COLUMN prompt_templates.display_name IS 'User-friendly name shown in UI (e.g., "Cost-Efficient Rapid Analysis")';
COMMENT ON COLUMN prompt_templates.description IS 'Detailed description of use case, accuracy, and performance';
COMMENT ON COLUMN prompt_templates.prompt_type IS 'Type: system (role/context), user (actual prompt), or combined (both)';
COMMENT ON COLUMN prompt_templates.input_type IS 'Input type: email, url, or both';
COMMENT ON COLUMN prompt_templates.system_prompt IS 'System prompt defining AI role and analysis methodology';
COMMENT ON COLUMN prompt_templates.user_prompt IS 'User prompt with variable placeholders (e.g., {{sender_email}})';
COMMENT ON COLUMN prompt_templates.token_estimate IS 'Estimated token count for cost calculation';
COMMENT ON COLUMN prompt_templates.cost_tier IS 'Cost tier: cost_efficient, balanced, or comprehensive';
COMMENT ON COLUMN prompt_templates.accuracy_target IS 'Target accuracy (0.0-1.0, e.g., 0.96 for 96%)';
COMMENT ON COLUMN prompt_templates.scenario_tags IS 'Tags for filtering (e.g., {high-volume, vip, default})';
COMMENT ON COLUMN prompt_templates.is_default IS 'Is this the default template for its tier?';
COMMENT ON COLUMN prompt_templates.is_system_template IS 'Is this a built-in system template (read-only)?';

-- Step 2: Add prompt_template_id to ai_model_configs
ALTER TABLE ai_model_configs
  ADD COLUMN IF NOT EXISTS prompt_template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_model_configs.prompt_template_id IS 'Reference to prompt template - defines how AI analyzes emails';

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prompt_templates_tier ON prompt_templates(cost_tier) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_templates_default ON prompt_templates(is_default) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_templates_tags ON prompt_templates USING GIN(scenario_tags);

-- Step 4: Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prompt_templates_updated_at ON prompt_templates;
CREATE TRIGGER prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_prompt_templates_updated_at();

-- ============================================================================
-- Step 5: Seed 3 World-Class Prompt Templates
-- ============================================================================

-- Template 1: Cost-Efficient Rapid Analysis (450-500 tokens)
INSERT INTO prompt_templates (
  name, display_name, description, prompt_type, input_type,
  system_prompt, user_prompt, token_estimate, cost_tier, accuracy_target,
  scenario_tags, is_default, is_system_template
)
VALUES (
  'cost_efficient_rapid',
  'Cost-Efficient Rapid Analysis',
  'High-volume scanning with 90-93% accuracy. Flags only high-confidence threats. Best for first-pass filtering and budget-conscious deployments. ~450-500 tokens, very fast processing.',
  'combined',
  'email',
  -- System Prompt
  'You are a phishing detection expert analyzing emails efficiently. Focus on HIGH-CONFIDENCE threats only.

CORE RULES:
1. Multiple weak signals together = escalate severity
2. Single critical signal (typosquatting, auth failure + credential form) = flag immediately
3. Legitimate business patterns (IT password resets, invoice requests from verified senders) = lower severity
4. When uncertain (confidence < 0.7) = mark as "needs_review" not "malicious"

CONFIDENCE LEVELS:
- 0.8-1.0: Clear evidence, definitive phishing
- 0.5-0.79: Suspicious, human review needed
- 0.0-0.49: Low concern, likely legitimate

OUTPUT: JSON array ending with one "final_verdict" signal containing actionable summary.',
  -- User Prompt
  'RAPID PHISHING ANALYSIS

From: {{sender_email}} | Domain: {{sender_domain}}
Subject: {{subject}}
Body: {{body_snippet}}

AUTH STATUS: SPF={{spf_status}}, DKIM={{dkim_status}}
{{#if is_role_account}}[Role Account: {{sender_email}}]{{/if}}

{{#if suspicious_links}}
⚠️ LINKS ({{link_count}}): {{suspicious_links_summary}}
{{/if}}

{{#if password_forms}}
⚠️ CREDENTIAL FORM: {{password_forms}} form(s) → {{form_action_domain}}
{{/if}}

{{#if qr_codes}}⚠️ QR CODES: {{qr_codes}} detected{{/if}}
{{#if urgency_score >= 8}}⚠️ URGENCY: {{urgency_score}}/10{{/if}}
{{#if attachments}}Attachments: {{attachment_summary}}{{/if}}

QUICK CHECKS:
1. Auth fail + external links + credential form = CRITICAL
2. Typosquatting domain (paypa1.com, micr0soft.com) = CRITICAL
3. Brand mismatch (display "PayPal" but domain ≠ paypal.com) = HIGH
4. QR code + urgency + auth fail = HIGH
5. Legitimate sender + internal links = SAFE

RETURN FORMAT:
[
  {"signalType": "...", "severity": "low|medium|high|critical", "confidence": 0.0-1.0, "description": "..."},
  {
    "signalType": "final_verdict",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "VERDICT: [Safe|Suspicious|Malicious]

THREAT SUMMARY: [One-line threat assessment]
PRIMARY INDICATORS: [Top 2-3 red flags]
RECOMMENDED ACTION: [Block/Quarantine/Review/Allow]

Example: ''VERDICT: Malicious | THREAT: PayPal credential theft via typosquatting | INDICATORS: (1) Domain paypa1.com mimics paypal.com, (2) Auth failure, (3) Credential form → external site | ACTION: Block immediately''"
  }
]

Focus on definitive indicators. Flag only when confident (0.7+).',
  475,
  'cost_efficient',
  0.92,
  ARRAY['high-volume', 'fast', 'budget', 'triage', 'screening'],
  false,
  true
) ON CONFLICT (name) DO NOTHING;

-- Template 2: Hybrid Balanced Analysis (650-750 tokens) ⭐ RECOMMENDED DEFAULT
INSERT INTO prompt_templates (
  name, display_name, description, prompt_type, input_type,
  system_prompt, user_prompt, token_estimate, cost_tier, accuracy_target,
  scenario_tags, is_default, is_system_template
)
VALUES (
  'hybrid_balanced',
  'Hybrid Balanced Analysis ⭐',
  'Recommended default with 95-97% accuracy. Comprehensive 360-degree analysis covering all attack vectors. Optimal balance of cost and accuracy for production deployments. ~650-750 tokens.',
  'combined',
  'email',
  -- System Prompt
  'You are a world-class email security analyst with expertise in phishing detection, social engineering, and threat intelligence.

ANALYSIS FRAMEWORK:

1. SIGNAL CORRELATION:
   - Weak signal alone = LOW severity
   - 2-3 weak signals together = MEDIUM severity (investigate)
   - 1 high + 1 medium signal = HIGH severity (likely threat)
   - 1 critical signal = CRITICAL severity (definitive threat)

2. LEGITIMATE PATTERNS (do not over-flag):
   - IT department password resets from verified domain
   - Finance invoice requests from known vendors
   - Marketing emails with urgency (sales, limited-time offers)
   - Security alerts from actual service providers

3. PHISHING PATTERNS (high priority):
   - Authentication failure + external links + urgency
   - Typosquatting + credential harvesting
   - CEO impersonation + wire transfer requests
   - Brand mismatch + suspicious domains
   - QR code fraud (QR → credential form)

4. CONFIDENCE CALIBRATION:
   - 0.85-1.0: Multiple corroborating signals, clear evidence
   - 0.65-0.84: Strong indicators but some ambiguity
   - 0.4-0.64: Mixed signals, human review recommended
   - 0.0-0.39: Minimal concern, likely legitimate

OUTPUT REQUIREMENTS:
- Analyze sender, domains, links, content, patterns
- Return JSON array with detailed signals
- End with "final_verdict" containing: verdict, threat summary, indicators, confidence rationale, recommended action',
  -- User Prompt
  'COMPREHENSIVE EMAIL THREAT ANALYSIS

=== SENDER & AUTHENTICATION ===
From: {{sender_email}} ({{sender_domain}})
Display Name: {{display_name}}
{{#if reply_to_mismatch}}⚠️ Reply-To: {{reply_to}} [MISMATCH]{{/if}}

Authentication:
- SPF: {{spf_status}} | DKIM: {{dkim_status}} | DMARC: {{dmarc_status}}
- Role Account: {{is_role_account}} | Disposable: {{is_disposable}}
{{#if domain_age_days < 90}}⚠️ Domain Age: {{domain_age_days}} days (NEW){{/if}}

=== EMAIL CONTENT ===
Subject: {{subject}}
Body Preview: {{body_preview}}

=== 360-DEGREE THREAT INDICATORS ===

**1. DOMAIN ANALYSIS:**
- All Domains: {{all_domains}}
- External Domains: {{external_domains}}
{{#if typosquatting_detected}}⚠️ TYPOSQUATTING: {{typosquatting_domains}}{{/if}}

**2. LINK ANALYSIS ({{link_count}} total):**
{{#each top_links}}
{{@index}}. {{this.url}} | Risk: {{this.risk_score}}/10
   {{#if this.is_shortened}}⚠️ URL Shortener{{/if}}
   {{#if this.redirect_chain}}⚠️ Redirects{{/if}}
{{/each}}

**3. CREDENTIAL HARVESTING:**
{{#if password_forms}}
⚠️ CRITICAL: {{password_forms}} form(s) with password fields
{{/if}}

**4. VISUAL CONTENT:**
{{#if qr_codes}}⚠️ QR CODES: {{qr_codes}} detected{{/if}}

**5. ATTACHMENTS:**
{{#if attachments}}{{attachments}}{{/if}}

**6. URGENCY & MANIPULATION:**
{{#if urgency_detected}}Urgency: {{urgency_score}}/10{{/if}}

**7. IMPERSONATION:**
{{#if brand_mismatch}}⚠️ Claims {{claimed_brand}} but domain is {{actual_domain}}{{/if}}

=== DECISION FRAMEWORK ===

CRITICAL: Typosquatting + credential form | Auth failure + external credential submission | CEO impersonation + wire transfer
HIGH: Auth failure + external links + urgency | Known phishing patterns
MEDIUM: External links from authenticated sender | Urgency + external links
LOW: Authenticated sender + internal links + normal content

RETURN FORMAT:
[
  {"signalType": "...", "severity": "...", "confidence": 0.0-1.0, "description": "..."},
  {
    "signalType": "final_verdict",
    "severity": "...",
    "confidence": 0.0-1.0,
    "description": "VERDICT: [Safe|Suspicious|Malicious]

THREAT SUMMARY: [2-3 sentence overview]

PRIMARY INDICATORS:
1. [Most significant red flag with evidence]
2. [Second most significant]
3. [Third if applicable]

CONFIDENCE RATIONALE: [Why this confidence level?]

RECOMMENDED ACTION: [Block/Quarantine/Review/Allow with context]"
  }
]

Analyze all 8 threat categories. Synthesize findings into clear, actionable verdict.',
  700,
  'balanced',
  0.96,
  ARRAY['default', 'recommended', 'production', 'comprehensive', 'general'],
  true,
  true
) ON CONFLICT (name) DO NOTHING;

-- Template 3: Comprehensive Deep Analysis (1000-1100 tokens)
INSERT INTO prompt_templates (
  name, display_name, description, prompt_type, input_type,
  system_prompt, user_prompt, token_estimate, cost_tier, accuracy_target,
  scenario_tags, is_default, is_system_template
)
VALUES (
  'comprehensive_deep',
  'Comprehensive Deep Analysis',
  'Maximum accuracy (98-99%) with forensic-level analysis. For VIP/Executive emails, suspicious items flagged by other tiers, and incident investigation. Covers APT, BEC, and sophisticated attacks. ~1000-1100 tokens.',
  'combined',
  'email',
  -- System Prompt
  'You are a senior threat intelligence analyst specializing in Advanced Persistent Threats (APT), sophisticated phishing campaigns, and Business Email Compromise (BEC) attacks.

THREAT SOPHISTICATION LEVELS:
LEVEL 1 - MASS PHISHING (90%): Generic templates, obvious spoofing, URL shorteners
LEVEL 2 - TARGETED PHISHING (8%): Personalized, professional, may pass auth (compromised accounts)
LEVEL 3 - APT/BEC (2%): Highly targeted, passes authentication, context-appropriate, detected by subtle anomalies

ADVANCED ANALYSIS:
1. MULTI-LAYER VERIFICATION: Technical (auth, domains) + Behavioral (sender patterns) + Contextual (timing, channel)
2. COMPROMISED ACCOUNT DETECTION: Passes SPF/DKIM but unusual request, tone mismatch, off-hours, outside normal role
3. SOPHISTICATED EVASION: DGA, homograph attacks, time-delayed redirects, image-based phishing, QR fraud, JS content switching

SIGNAL WEIGHTING:
CRITICAL (10): Typosquatting + credential | BEC + wire transfer | Malicious executable | QR → credential harvesting
HIGH (7-8): Auth failure + external credential | Brand impersonation | Compromised account
MEDIUM (4-6): External links from authenticated | Urgency + external | URL shorteners + credentials
LOW (1-2): Legitimate patterns, expected communications

CONFIDENCE: 0.95-1.0 definitive | 0.85-0.94 strong | 0.70-0.84 clear | 0.50-0.69 moderate | 0.30-0.49 minor | 0.0-0.29 normal

OUTPUT: Comprehensive forensic analysis with weighted risk calculation, confidence intervals, and specific escalation procedures.',
  -- User Prompt
  'FORENSIC EMAIL THREAT ANALYSIS

=== COMPLETE SENDER PROFILE ===
From: {{sender_email}} ({{sender_domain}})
Display Name: {{display_name}}
Reply-To: {{reply_to}}
{{#if x_originating_ip}}IP: {{x_originating_ip}} ({{ip_geolocation}}){{/if}}

Authentication Deep Dive:
- SPF: {{spf_status}} | DKIM: {{dkim_status}} | DMARC: {{dmarc_status}}

Sender Reputation:
- Domain Age: {{domain_age}}{{#if domain_recently_registered}} ⚠️ NEW{{/if}}
- Reputation: {{domain_reputation_score}}/100
- Previous Emails: {{historical_count}}{{#if is_new_sender}} ⚠️ FIRST TIME{{/if}}

=== EMAIL CONTENT FORENSICS ===
Subject: {{subject}}
Date: {{email_date}}{{#if off_hours}} ⚠️ OFF-HOURS{{/if}}
Language: {{detected_language}} | Grammar: {{grammar_score}}/10
Body: {{full_body}}

=== COMPREHENSIVE DOMAIN ANALYSIS ===
{{#if typosquatting_similarity}}⚠️ TYPOSQUATTING: {{typosquatting_similarity}}% similar to {{legitimate_domain}}{{/if}}
{{#if homograph_detected}}⚠️ HOMOGRAPH ATTACK: {{homograph_chars}}{{/if}}

=== ADVANCED LINK ANALYSIS ===
{{#each all_links}}
Link {{@index}}: {{this.url}}
- Risk: {{this.risk_score}}/10 | SSL: {{this.ssl_valid}}
{{#if this.redirect_chain}}⚠️ REDIRECT CHAIN: {{this.redirect_count}} hops{{/if}}
{{#if this.javascript_required}}⚠️ JS REQUIRED{{/if}}
{{/each}}

=== CREDENTIAL HARVESTING ===
{{#if forms_detected}}
{{#each forms}}
Form {{@index}}: {{this.action_url}}
{{#if this.has_password}}⚠️ PASSWORD{{/if}}
{{#if this.action_domain_mismatch}}⚠️ SUBMITS TO {{this.action_domain}}{{/if}}
{{/each}}
{{/if}}

=== VISUAL CONTENT ===
{{#if qr_codes}}
⚠️ QR CODES: {{qr_code_count}} total
{{#each qr_codes}}
QR {{@index}}: {{this.decoded_url}} → {{this.destination_domain}} (Risk: {{this.risk_assessment}})
{{/each}}
{{/if}}

=== ATTACHMENTS FORENSICS ===
{{#each attachments}}
{{@index}}. {{this.filename}} ({{this.extension}})
{{#if this.is_executable}}⚠️ EXECUTABLE{{/if}}
{{#if this.has_macros}}⚠️ MACROS{{/if}}
{{/each}}

=== URGENCY & MANIPULATION ===
{{#if urgency_analysis}}Urgency: {{urgency_score}}/10{{#if urgency_score >= 8}} ⚠️ EXTREME{{/if}}
Time Pressure: {{time_pressure_count}} | Fear: {{fear_tactic_count}} | Authority: {{authority_invocation_count}}{{/if}}

=== IMPERSONATION & BRAND ===
{{#if impersonation_detected}}
⚠️ IMPERSONATION: Claims {{claimed_brand}} but domain is {{actual_domain}} ({{similarity_score}}% similar)
{{/if}}
{{#if ceo_fraud_indicators}}⚠️ BEC INDICATORS: {{executive_keywords}} | Wire Transfer: {{wire_transfer_detected}}{{/if}}

=== BEHAVIORAL ANOMALIES ===
{{#if sender_history_available}}
{{#if tone_mismatch}}⚠️ Tone Mismatch{{/if}}
{{#if unusual_timing}}⚠️ Unusual Timing{{/if}}
{{#if unusual_request}}⚠️ Unusual Request{{/if}}
{{/if}}

=== KNOWN THREAT INTELLIGENCE ===
{{#if threat_intel}}Matches: {{#each threat_intel_matches}}{{this.category}} ({{this.confidence}}){{/each}}{{/if}}

=== COMPREHENSIVE RISK CALCULATION ===
Apply weighted scoring (CRITICAL×10 | HIGH×7-8 | MEDIUM×4-6 | LOW×1-2)
Total Risk Score = Σ(Severity × Weight × Confidence)

RETURN FORMAT:
[
  {"signalType": "...", "severity": "...", "confidence": 0.0-1.0, "weight": 1-10, "description": "...", "evidence": {"technical": "...", "behavioral": "...", "contextual": "..."}},
  {
    "signalType": "final_verdict",
    "severity": "...",
    "confidence": 0.0-1.0,
    "total_risk_score": 0-100,
    "description": "VERDICT: [Safe|Suspicious|Malicious]

=== THREAT ASSESSMENT ===
Threat Level: [CRITICAL|HIGH|MEDIUM|LOW]
Attack Type: [e.g., Credential Harvesting via Typosquatting, BEC Wire Transfer Fraud]
Sophistication: [Level 1: Mass | Level 2: Targeted | Level 3: APT/BEC]

=== PRIMARY INDICATORS (Ranked) ===
1. [Signal] (Weight: X, Confidence: Y) - [Evidence]
2. [Signal] (Weight: X, Confidence: Y) - [Evidence]
3. [Signal] (Weight: X, Confidence: Y) - [Evidence]

=== DETAILED ANALYSIS ===
[3-5 paragraphs: what makes this suspicious/safe, how signals correlate, legitimate explanations considered and ruled out, why this confidence level, what would change assessment]

=== CONFIDENCE RATIONALE ===
Confidence: X.XX/1.0
Factors Increasing: [evidence]
Factors Limiting: [uncertainties]
Alternatives Considered: [scenarios ruled out with reasons]

=== RECOMMENDED ACTIONS ===
Immediate: [Block/Quarantine/Warn/Allow]
Steps: 1. [action] 2. [action] 3. [mitigation]
Escalation: [when and what information]
User Guidance: [what to tell recipient]"
  }
]

Perform comprehensive 360-degree analysis. Leave no attack vector unexamined.',
  1050,
  'comprehensive',
  0.98,
  ARRAY['vip', 'executive', 'forensic', 'incident-response', 'apt', 'bec', 'advanced'],
  false,
  true
) ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================
