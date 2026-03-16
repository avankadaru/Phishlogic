-- ============================================================================
-- PhishLogic Admin UI - Update Analyzer Descriptions
-- ============================================================================
-- Migration: 013_update_analyzer_descriptions
-- Purpose: Update FormAnalyzer and RedirectAnalyzer descriptions to reflect
--          latest capabilities (login page detection, malicious behavior detection)
-- ============================================================================

-- Update FormAnalyzer description to reflect login page detection and OAuth recognition
UPDATE analyzers
SET description = 'Detects forms requesting sensitive information (passwords, credit cards, SSN, email). Integrates intelligent login page detection with OAuth provider recognition (Google, Facebook, Microsoft, Apple, GitHub, LinkedIn, Twitter) to distinguish legitimate login pages from phishing attempts. Uses confidence scoring (0.4-1.0) to reduce false positives on authentic login forms.'
WHERE analyzer_name = 'formAnalyzer';

-- Update RedirectAnalyzer description to reflect malicious behavior detection
UPDATE analyzers
SET description = 'Analyzes redirect chains and detects malicious behaviors. Identifies suspicious redirect patterns (3+ redirects = high severity, domain changes = medium severity). Detects drive-by download attacks (automatic downloads, iframe downloads), script execution attempts (eval, document.write), installation prompts (setup.exe, install now), and suspicious JavaScript patterns (FileReader, localStorage manipulation, WebAssembly). Uses Playwright browser automation with 10s timeout.'
WHERE analyzer_name = 'redirectAnalyzer';

-- Verify updates
SELECT analyzer_name, description FROM analyzers
WHERE analyzer_name IN ('formAnalyzer', 'redirectAnalyzer');
