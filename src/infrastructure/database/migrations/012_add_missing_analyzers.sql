-- Migration 012: Add Missing Analyzers to analyzers table
-- Adds 7 analyzers that exist in task_analyzers but missing from analyzers table

-- 1. Sender Reputation Analyzer
INSERT INTO analyzers (
  analyzer_name,
  display_name,
  description,
  analyzer_type,
  is_active,
  category,
  input_type
) VALUES (
  'senderReputationAnalyzer',
  'Sender Reputation Analyzer',
  'Checks sender domain reputation using WHOIS, DNS, and threat intelligence databases',
  'static',
  true,
  'sender_verification',
  'email'
) ON CONFLICT (analyzer_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  analyzer_type = EXCLUDED.analyzer_type,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  input_type = EXCLUDED.input_type;

-- 2. Link Reputation Analyzer
INSERT INTO analyzers (
  analyzer_name,
  display_name,
  description,
  analyzer_type,
  is_active,
  category,
  input_type
) VALUES (
  'linkReputationAnalyzer',
  'Link Reputation Analyzer',
  'Checks URL reputation using URLhaus, PhishTank, and other threat intelligence feeds',
  'static',
  true,
  'links',
  'url'
) ON CONFLICT (analyzer_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  analyzer_type = EXCLUDED.analyzer_type,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  input_type = EXCLUDED.input_type;

-- 3. Attachment Analyzer
INSERT INTO analyzers (
  analyzer_name,
  display_name,
  description,
  analyzer_type,
  is_active,
  category,
  input_type
) VALUES (
  'attachmentAnalyzer',
  'Attachment Analyzer',
  'Scans file attachments for malware, validates file types, and checks for suspicious patterns',
  'static',
  true,
  'attachments',
  'email'
) ON CONFLICT (analyzer_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  analyzer_type = EXCLUDED.analyzer_type,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  input_type = EXCLUDED.input_type;

-- 4. Content Analysis Analyzer
INSERT INTO analyzers (
  analyzer_name,
  display_name,
  description,
  analyzer_type,
  is_active,
  category,
  input_type
) VALUES (
  'contentAnalysisAnalyzer',
  'Content Analysis Analyzer',
  'Analyzes email content for emotional manipulation, urgency tactics, and phishing patterns',
  'static',
  true,
  'emotional_analysis',
  'email'
) ON CONFLICT (analyzer_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  analyzer_type = EXCLUDED.analyzer_type,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  input_type = EXCLUDED.input_type;

-- 5. Image Analyzer
INSERT INTO analyzers (
  analyzer_name,
  display_name,
  description,
  analyzer_type,
  is_active,
  category,
  input_type
) VALUES (
  'imageAnalyzer',
  'Image Analyzer',
  'Analyzes embedded images for hidden URLs, steganography, and malicious content',
  'dynamic',
  true,
  'images_qrcodes',
  'email'
) ON CONFLICT (analyzer_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  analyzer_type = EXCLUDED.analyzer_type,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  input_type = EXCLUDED.input_type;

-- 6. QR Code Analyzer
INSERT INTO analyzers (
  analyzer_name,
  display_name,
  description,
  analyzer_type,
  is_active,
  category,
  input_type
) VALUES (
  'qrcodeAnalyzer',
  'QR Code Analyzer',
  'Decodes QR codes and checks embedded URLs for phishing and malware threats',
  'dynamic',
  true,
  'images_qrcodes',
  'email'
) ON CONFLICT (analyzer_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  analyzer_type = EXCLUDED.analyzer_type,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  input_type = EXCLUDED.input_type;

-- 7. Button Analyzer
INSERT INTO analyzers (
  analyzer_name,
  display_name,
  description,
  analyzer_type,
  is_active,
  category,
  input_type
) VALUES (
  'buttonAnalyzer',
  'Button/CTA Analyzer',
  'Analyzes HTML buttons and call-to-action elements for hidden tracking and malicious redirects',
  'dynamic',
  true,
  'buttons_cta',
  'email'
) ON CONFLICT (analyzer_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  analyzer_type = EXCLUDED.analyzer_type,
  is_active = EXCLUDED.is_active,
  category = EXCLUDED.category,
  input_type = EXCLUDED.input_type;

-- Add migration record
INSERT INTO schema_migrations (version, applied_at)
VALUES (12, NOW())
ON CONFLICT (version) DO NOTHING;
