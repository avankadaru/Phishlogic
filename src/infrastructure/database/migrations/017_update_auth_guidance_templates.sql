-- Migration 017: Add auth guidance to system prompt templates
-- Fixes SPF/DKIM/DMARC showing as "unknown" in AI/hybrid analysis
-- Adds DKIM fragility note to prevent over-escalating forwarded/mailing-list emails
-- Auth failure alone must only contribute to Suspicious verdict, not Malicious

-- Template 1: cost_efficient_rapid
-- Also adds missing DMARC (was only showing SPF+DKIM)
UPDATE prompt_templates
SET user_prompt = REPLACE(
  user_prompt,
  'AUTH STATUS: SPF={{spf_status}}, DKIM={{dkim_status}}',
  'AUTH STATUS: SPF={{spf_status}}, DKIM={{dkim_status}}, DMARC={{dmarc_status}}'
    || E'\n' || '{{auth_guidance}}'
    || E'\n' || '{{auth_verification_note}}'
)
WHERE name = 'cost_efficient_rapid' AND is_system_template = true;

-- Template 2: hybrid_balanced (default template used for most analyses)
UPDATE prompt_templates
SET user_prompt = REPLACE(
  user_prompt,
  '- SPF: {{spf_status}} | DKIM: {{dkim_status}} | DMARC: {{dmarc_status}}',
  '- SPF: {{spf_status}} | DKIM: {{dkim_status}} | DMARC: {{dmarc_status}}'
    || E'\n' || '{{auth_guidance}}'
    || E'\n' || '{{auth_verification_note}}'
)
WHERE name = 'hybrid_balanced' AND is_system_template = true;

-- Template 3: comprehensive_deep
UPDATE prompt_templates
SET user_prompt = REPLACE(
  user_prompt,
  '- SPF: {{spf_status}} | DKIM: {{dkim_status}} | DMARC: {{dmarc_status}}',
  '- SPF: {{spf_status}} | DKIM: {{dkim_status}} | DMARC: {{dmarc_status}}'
    || E'\n' || '{{auth_guidance}}'
    || E'\n' || '{{auth_verification_note}}'
)
WHERE name = 'comprehensive_deep' AND is_system_template = true;
