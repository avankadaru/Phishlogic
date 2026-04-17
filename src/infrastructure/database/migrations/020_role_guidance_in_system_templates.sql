-- Migration 020: Inject {{role_guidance}} into system prompt templates.
--
-- Why: Role-based sender addresses (noreply@, notifications@, auto-confirm@,
-- service@, billing@, support@) are normal for legitimate transactional
-- senders (banks, SaaS platforms, code hosts). Without explicit guidance
-- the AI can over-rotate on is_role_account=true and mark legitimate
-- notification emails as Suspicious.
--
-- The ai-execution.service.ts buildTemplateVariables() now always sets a
-- `role_guidance` variable (parallel to `auth_guidance`). This migration
-- makes the three shipped system templates reference that variable so its
-- text actually reaches the AI.
--
-- Safe to overwrite: the Admin UI blocks user edits to system templates
-- (is_system_template = true), so there are no user edits to preserve.
-- Idempotent: each UPDATE no-ops once {{role_guidance}} is already present.

-- Template 1: cost_efficient_rapid
-- We previously appended {{auth_guidance}} + {{auth_verification_note}} right
-- after the AUTH STATUS line in migration 017. Append {{role_guidance}} in
-- the same block so role-account context travels with authentication context.
UPDATE prompt_templates
SET user_prompt = REPLACE(
  user_prompt,
  '{{auth_guidance}}' || E'\n' || '{{auth_verification_note}}',
  '{{auth_guidance}}' || E'\n' || '{{role_guidance}}' || E'\n' || '{{auth_verification_note}}'
)
WHERE name = 'cost_efficient_rapid'
  AND is_system_template = true
  AND user_prompt NOT LIKE '%{{role_guidance}}%';

-- Template 2: hybrid_balanced (default template used for most analyses)
UPDATE prompt_templates
SET user_prompt = REPLACE(
  user_prompt,
  '{{auth_guidance}}' || E'\n' || '{{auth_verification_note}}',
  '{{auth_guidance}}' || E'\n' || '{{role_guidance}}' || E'\n' || '{{auth_verification_note}}'
)
WHERE name = 'hybrid_balanced'
  AND is_system_template = true
  AND user_prompt NOT LIKE '%{{role_guidance}}%';

-- Template 3: comprehensive_deep
UPDATE prompt_templates
SET user_prompt = REPLACE(
  user_prompt,
  '{{auth_guidance}}' || E'\n' || '{{auth_verification_note}}',
  '{{auth_guidance}}' || E'\n' || '{{role_guidance}}' || E'\n' || '{{auth_verification_note}}'
)
WHERE name = 'comprehensive_deep'
  AND is_system_template = true
  AND user_prompt NOT LIKE '%{{role_guidance}}%';
