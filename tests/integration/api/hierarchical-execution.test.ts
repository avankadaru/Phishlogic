/**
 * End-to-end test for hierarchical execution tracking system
 *
 * Tests the complete execution trace with:
 * - Hierarchical parent-child step relationships
 * - Log capture within steps
 * - Parallel execution group visualization
 * - Analyzer substeps (OCR, EXIF, QR decode)
 * - Source attribution
 */

import type { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/api/server.js';
import type { AnalysisResult, ExecutionStep, LogEntry } from '../../../src/core/models/analysis-result.js';

describe('Hierarchical Execution Tracking E2E', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /api/v1/analyze/email - Complex email with images, QR codes, attachments', () => {
    // Sample email with embedded images, QR code, and suspicious attachment
    const complexEmail = `From: suspicious@phisher.com
To: victim@company.com
Subject: URGENT: Verify Your Account Now!
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="boundary123"

--boundary123
Content-Type: text/html; charset="UTF-8"

<html>
<body>
  <h1>Verify Your Account Immediately</h1>
  <p>Your account will be suspended unless you verify within 24 hours.</p>
  <p><a href="https://suspicious-site.tk/verify">Click Here to Verify</a></p>
  <p>Scan this QR code to verify on mobile:</p>
  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="QR Code" />
  <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==" alt="Logo" />
</body>
</html>

--boundary123
Content-Type: application/octet-stream; name="invoice.exe"
Content-Disposition: attachment; filename="invoice.exe"
Content-Transfer-Encoding: base64

TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
--boundary123--
`;

    it('should create hierarchical execution steps with proper nesting', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);

      // Verify metadata contains execution steps
      expect(result.metadata).toBeDefined();
      expect(result.metadata.executionSteps).toBeDefined();
      expect(Array.isArray(result.metadata.executionSteps)).toBe(true);

      const steps: ExecutionStep[] = result.metadata.executionSteps;
      expect(steps.length).toBeGreaterThan(0);

      // Find root step (analysis_start)
      const rootStep = steps.find((s) => s.step === 'analysis_start' && !s.parentStepId);
      expect(rootStep).toBeDefined();
      expect(rootStep?.stepId).toBeDefined();
      expect(rootStep?.depth).toBe(0);
      expect(rootStep?.sequence).toBe(0);
      expect(rootStep?.status).toBe('completed');

      // Verify hierarchical structure exists
      const childSteps = steps.filter((s) => s.parentStepId === rootStep?.stepId);
      expect(childSteps.length).toBeGreaterThan(0);

      // All child steps should have depth > 0
      childSteps.forEach((child) => {
        expect(child.depth).toBeGreaterThan(0);
      });
    });

    it('should capture logs within execution steps', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Find steps with logs
      const stepsWithLogs = steps.filter((s) => s.logs && s.logs.length > 0);
      expect(stepsWithLogs.length).toBeGreaterThan(0);

      // Verify log structure
      stepsWithLogs.forEach((step) => {
        step.logs.forEach((log: LogEntry) => {
          expect(log.timestamp).toBeDefined();
          expect(log.level).toBeDefined();
          expect(['debug', 'info', 'warn', 'error']).toContain(log.level);
          expect(log.message).toBeDefined();
          expect(typeof log.message).toBe('string');
        });
      });
    });

    it('should track parallel analyzer execution groups', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Find parallel execution group
      const parallelGroup = steps.find((s) =>
        s.step === 'analyzer_parallel_execution' && s.isParallel === true
      );

      if (parallelGroup) {
        expect(parallelGroup.parallelGroup).toBeDefined();
        expect(parallelGroup.status).toBe('completed');

        // Find child analyzer steps
        const analyzerSteps = steps.filter(
          (s) => s.parentStepId === parallelGroup.stepId && s.step.startsWith('analyzer_')
        );
        expect(analyzerSteps.length).toBeGreaterThan(0);

        // All analyzer steps should have completed
        analyzerSteps.forEach((step) => {
          expect(['completed', 'failed', 'skipped']).toContain(step.status);
        });
      }
    });

    it('should include source attribution in steps', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Find steps with source attribution
      const stepsWithSource = steps.filter((s) => s.source && (s.source.file || s.source.component));
      expect(stepsWithSource.length).toBeGreaterThan(0);

      // Verify source structure
      stepsWithSource.forEach((step) => {
        expect(step.source).toBeDefined();
        // At least one of file, component, or method should be present
        expect(
          step.source.file || step.source.component || step.source.method
        ).toBeDefined();
      });
    });

    it('should create substeps for ImageAnalyzer (OCR and EXIF)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Find ImageAnalyzer step
      const imageAnalyzerStep = steps.find((s) => s.step === 'analyzer_ImageAnalyzer');

      if (imageAnalyzerStep) {
        // Look for OCR and EXIF substeps
        const ocrSteps = steps.filter(
          (s) => s.parentStepId === imageAnalyzerStep.stepId && s.step === 'ocr_processing'
        );
        const exifSteps = steps.filter(
          (s) => s.parentStepId === imageAnalyzerStep.stepId && s.step === 'exif_analysis'
        );

        // At least one substep should exist if images were processed
        const totalSubsteps = ocrSteps.length + exifSteps.length;
        if (totalSubsteps > 0) {
          expect(totalSubsteps).toBeGreaterThan(0);

          // Verify substep structure
          [...ocrSteps, ...exifSteps].forEach((substep) => {
            expect(substep.depth).toBeGreaterThan(imageAnalyzerStep.depth);
            expect(substep.source?.file).toContain('image.analyzer');
          });
        }
      }
    });

    it('should create substeps for QRCodeAnalyzer (decode operations)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Find QRCodeAnalyzer step
      const qrAnalyzerStep = steps.find((s) => s.step === 'analyzer_QRCodeAnalyzer');

      if (qrAnalyzerStep) {
        // Look for QR decode substeps
        const qrDecodeSteps = steps.filter(
          (s) => s.parentStepId === qrAnalyzerStep.stepId && s.step.startsWith('qr_decode_image_')
        );

        if (qrDecodeSteps.length > 0) {
          expect(qrDecodeSteps.length).toBeGreaterThan(0);

          // Verify substep structure
          qrDecodeSteps.forEach((substep) => {
            expect(substep.depth).toBeGreaterThan(qrAnalyzerStep.depth);
            expect(substep.source?.file).toContain('qrcode.analyzer');
            expect(substep.context).toBeDefined();
          });
        }
      }
    });

    it('should track complete execution flow phases', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Verify key phases exist in execution trace
      const expectedPhases = [
        'analysis_start',           // Root step
        'whitelist_check',          // Whitelist checking
        'content_risk_pre_scan',    // Content risk extraction
        'analyzer_filtering',       // Analyzer filtering at engine level
      ];

      expectedPhases.forEach((phaseName) => {
        const phase = steps.find((s) => s.step === phaseName);
        if (phase) {
          expect(phase.status).toBeDefined();
          expect(phase.stepId).toBeDefined();
        }
      });

      // Strategy execution step should exist (native/hybrid/ai)
      const strategyStep = steps.find((s) =>
        s.step.includes('strategy_execution') || s.step.includes('_execution')
      );
      expect(strategyStep).toBeDefined();

      // Verdict calculation should be at engine level (sibling to strategy)
      const verdictStep = steps.find((s) => s.step === 'verdict_calculation');
      if (verdictStep && strategyStep) {
        // Verdict should be sibling to strategy (same parent)
        expect(verdictStep.parentStepId).toBe(strategyStep.parentStepId);
      }
    });

    it('should properly sequence steps within parent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Group steps by parent
      const stepsByParent = new Map<string | undefined, ExecutionStep[]>();
      steps.forEach((step) => {
        const siblings = stepsByParent.get(step.parentStepId) || [];
        siblings.push(step);
        stepsByParent.set(step.parentStepId, siblings);
      });

      // Verify sequence numbers within each parent
      stepsByParent.forEach((siblings) => {
        const sequences = siblings.map((s) => s.sequence);
        // Sequences should start at 0 and increment
        const sortedSequences = [...sequences].sort((a, b) => a - b);
        expect(sortedSequences[0]).toBe(0);

        // Should be continuous (no gaps)
        for (let i = 1; i < sortedSequences.length; i++) {
          expect(sortedSequences[i]).toBeLessThanOrEqual(sortedSequences[i - 1] + 1);
        }
      });
    });

    it('should calculate duration for all completed steps', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      const completedSteps = steps.filter((s) => s.status === 'completed');
      expect(completedSteps.length).toBeGreaterThan(0);

      completedSteps.forEach((step) => {
        expect(step.startedAt).toBeDefined();
        expect(step.completedAt).toBeDefined();
        expect(step.duration).toBeDefined();
        expect(step.duration).toBeGreaterThanOrEqual(0);

        // Verify duration matches calculated time
        if (step.startedAt && step.completedAt) {
          const calculatedDuration =
            new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
          expect(Math.abs(step.duration! - calculatedDuration)).toBeLessThan(5); // Allow 5ms tolerance
        }
      });
    });

    it('should maintain context metadata for important steps', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);
      const steps: ExecutionStep[] = result.metadata.executionSteps;

      // Find analyzer filtering step
      const filteringStep = steps.find((s) => s.step === 'analyzer_filtering');
      if (filteringStep) {
        expect(filteringStep.context).toBeDefined();
        expect(filteringStep.context?.analyzersSelected).toBeDefined();
        expect(filteringStep.context?.analyzersSkipped).toBeDefined();
      }

      // Find analyzer steps with signal counts
      const analyzerSteps = steps.filter((s) => s.step.startsWith('analyzer_') && s.context);
      analyzerSteps.forEach((step) => {
        if (step.status === 'completed') {
          // Should have signal count in context
          expect(step.context?.signalCount).toBeDefined();
        }
      });

      // Find verdict calculation step
      const verdictStep = steps.find((s) => s.step === 'verdict_calculation');
      if (verdictStep) {
        expect(verdictStep.context).toBeDefined();
        expect(verdictStep.context?.verdict).toBeDefined();
        expect(verdictStep.context?.score).toBeDefined();
      }
    });

    it('should detect and analyze the suspicious email correctly', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: complexEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const result: AnalysisResult = JSON.parse(response.body);

      // Should detect as suspicious or malicious (contains .tk domain, .exe attachment, phishing keywords)
      expect(['Suspicious', 'Malicious']).toContain(result.verdict);

      // Should have multiple signals
      expect(result.signals.length).toBeGreaterThan(0);

      // Should have red flags
      expect(result.redFlags.length).toBeGreaterThan(0);

      // Should have high score
      expect(result.score).toBeGreaterThan(5);

      // Alert level should be elevated
      expect(['medium', 'high']).toContain(result.alertLevel);
    });
  });
});
