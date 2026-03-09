-- Migration 007: Add Execution Mode Tracking with JSONB Metadata
-- Purpose: Enable Native/Hybrid/AI execution modes with minimal future changes

-- Core execution mode tracking (simple scalar columns)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(20)
  CHECK (execution_mode IN ('native', 'hybrid', 'ai'));
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS input_source VARCHAR(100);

-- JSONB columns for flexible metadata (additive-only, future-proof)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT '{}';
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS timing_metadata JSONB DEFAULT '{}';
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS error_details JSONB DEFAULT '{}';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_analyses_execution_mode ON analyses(execution_mode);
CREATE INDEX IF NOT EXISTS idx_analyses_input_source ON analyses(input_source);

-- GIN indexes for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_analyses_ai_metadata_gin ON analyses USING GIN (ai_metadata);
CREATE INDEX IF NOT EXISTS idx_analyses_timing_metadata_gin ON analyses USING GIN (timing_metadata);
CREATE INDEX IF NOT EXISTS idx_analyses_error_details_gin ON analyses USING GIN (error_details);

-- Create view for backward compatibility with debug controller
-- NO COLUMN RENAMING - use aliases in view instead!
CREATE OR REPLACE VIEW analyses_debug_view AS
SELECT
  id,
  verdict,
  confidence AS confidence_score,              -- Alias existing column
  red_flags AS risk_factors,                   -- Alias existing column
  duration_ms AS processing_time_ms,           -- Alias existing column
  ai_cost_usd AS cost_usd,                     -- Alias existing column
  execution_mode,
  input_source,
  created_at,
  analyzed_at,

  -- Extract AI metadata from JSONB
  (ai_metadata->>'provider')::VARCHAR(50) AS ai_provider,
  (ai_metadata->>'model')::VARCHAR(100) AS ai_model,
  (ai_metadata->'tokens'->>'total')::INTEGER AS ai_tokens_total,
  (ai_metadata->'tokens'->>'prompt')::INTEGER AS ai_prompt_tokens,
  (ai_metadata->'tokens'->>'completion')::INTEGER AS ai_completion_tokens,
  (ai_metadata->>'temperature')::DECIMAL(3,2) AS ai_model_temperature,
  (ai_metadata->>'latency_ms')::INTEGER AS ai_latency_ms,

  -- Extract timing metadata from JSONB
  (timing_metadata->>'ui_timestamp')::TIMESTAMPTZ AS ui_timestamp,
  (timing_metadata->>'backend_start_timestamp')::TIMESTAMPTZ AS backend_start_timestamp,
  (timing_metadata->>'network_latency_ms')::INTEGER AS network_latency_ms,

  -- Extract error details from JSONB
  (error_details->>'message')::TEXT AS error_message,
  (error_details->>'stack_trace')::TEXT AS error_stack_trace,
  (error_details->'context')::JSONB AS error_context,

  -- Keep original JSONB columns for full flexibility
  execution_steps,
  ai_metadata,
  timing_metadata,
  error_details
FROM analyses;

-- Add comments for documentation
COMMENT ON COLUMN analyses.execution_mode IS 'Execution mode: native, hybrid, or ai';
COMMENT ON COLUMN analyses.input_source IS 'Source of input: gmail, chrome, api';
COMMENT ON COLUMN analyses.ai_metadata IS 'AI execution metadata: { provider, model, tokens: { prompt, completion, total }, temperature, latency_ms, cost_usd }';
COMMENT ON COLUMN analyses.timing_metadata IS 'Timing metadata: { ui_timestamp, backend_start_timestamp, network_latency_ms }';
COMMENT ON COLUMN analyses.error_details IS 'Error details: { message, stack_trace, context: { file, line, function } }';
COMMENT ON VIEW analyses_debug_view IS 'Backward-compatible view with aliased column names for debug controller';

-- Migration tracking (optional but recommended)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT
);

INSERT INTO schema_migrations (version, description)
VALUES (7, 'Add execution mode tracking with JSONB metadata')
ON CONFLICT (version) DO NOTHING;
