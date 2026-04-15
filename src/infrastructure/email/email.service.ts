/**
 * Email service for sending alert notifications
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AnalysisResult } from '../../core/models/analysis-result.js';
import type { NormalizedInput } from '../../core/models/input.js';
import { isEmailInput, isUrlInput } from '../../core/models/input.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../logging/index.js';

const logger = getLogger();

/**
 * Email alert data
 */
export interface EmailAlertData {
  input: NormalizedInput;
  result: AnalysisResult;
  timestamp: Date;
}

/**
 * Email Service
 */
export class EmailService {
  private transporter: Transporter | null = null;
  private pendingAlerts: EmailAlertData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor() {
    const config = getConfig();

    if (config.email.enabled) {
      this.initializeTransporter();

      if (config.email.batchMode) {
        this.startBatchTimer();
      }

      logger.info('EmailService initialized');
    } else {
      logger.info('EmailService disabled in configuration');
    }
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter(): void {
    const config = getConfig();

    this.transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.user && config.email.smtp.password
        ? {
            user: config.email.smtp.user,
            pass: config.email.smtp.password,
          }
        : undefined,
    });

    logger.info({
      msg: 'Email transporter initialized',
      host: config.email.smtp.host,
      port: config.email.smtp.port,
    });
  }

  /**
   * Start batch timer for grouped notifications
   */
  private startBatchTimer(): void {
    const config = getConfig();

    this.batchTimer = setInterval(() => {
      if (this.pendingAlerts.length > 0) {
        this.sendBatchAlert().catch((error) => {
          logger.error({
            msg: 'Failed to send batch alert',
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }, config.email.batchInterval);

    logger.info({
      msg: 'Batch alert timer started',
      interval: config.email.batchInterval,
    });
  }

  /**
   * Send alert if conditions are met
   */
  async sendAlertIfNeeded(input: NormalizedInput, result: AnalysisResult): Promise<void> {
    const config = getConfig();

    if (!config.email.enabled) {
      return;
    }

    // Check if alert should be sent
    const shouldAlert = this.shouldSendAlert(result);

    if (!shouldAlert) {
      return;
    }

    const alertData: EmailAlertData = {
      input,
      result,
      timestamp: new Date(),
    };

    if (config.email.batchMode) {
      // Queue for batch sending
      this.pendingAlerts.push(alertData);
      logger.debug({
        msg: 'Alert queued for batch sending',
        queueSize: this.pendingAlerts.length,
      });
    } else {
      // Send immediately
      await this.sendSingleAlert(alertData);
    }
  }

  /**
   * Determine if alert should be sent
   */
  private shouldSendAlert(result: AnalysisResult): boolean {
    const config = getConfig();

    // Always alert on Malicious verdict
    if (result.verdict === 'Malicious') {
      return true;
    }

    // Alert if score exceeds threshold
    if (result.score >= config.email.alertThreshold) {
      return true;
    }

    return false;
  }

  /**
   * Send a single alert email
   */
  private async sendSingleAlert(alertData: EmailAlertData): Promise<void> {
    if (!this.transporter) {
      logger.warn('Cannot send alert - transporter not initialized');
      return;
    }

    const config = getConfig();

    if (config.email.alertRecipients.length === 0) {
      logger.warn('Cannot send alert - no recipients configured');
      return;
    }

    try {
      const subject = this.generateSubject(alertData);
      const htmlBody = this.generateHtmlBody(alertData);
      const textBody = this.generateTextBody(alertData);

      await this.transporter.sendMail({
        from: config.email.from,
        to: config.email.alertRecipients.join(', '),
        subject,
        text: textBody,
        html: htmlBody,
      });

      logger.info({
        msg: 'Alert email sent',
        recipients: config.email.alertRecipients.length,
        verdict: alertData.result.verdict,
        score: alertData.result.score,
      });
    } catch (error) {
      logger.error({
        msg: 'Failed to send alert email',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send batch alert email
   */
  private async sendBatchAlert(): Promise<void> {
    if (!this.transporter) {
      logger.warn('Cannot send batch alert - transporter not initialized');
      return;
    }

    const config = getConfig();
    const alertCount = this.pendingAlerts.length;

    if (alertCount === 0) {
      return;
    }

    try {
      const subject = `PhishLogic: ${alertCount} Security Alert${alertCount > 1 ? 's' : ''}`;
      const htmlBody = this.generateBatchHtmlBody(this.pendingAlerts);
      const textBody = this.generateBatchTextBody(this.pendingAlerts);

      await this.transporter.sendMail({
        from: config.email.from,
        to: config.email.alertRecipients.join(', '),
        subject,
        text: textBody,
        html: htmlBody,
      });

      logger.info({
        msg: 'Batch alert email sent',
        recipients: config.email.alertRecipients.length,
        alertCount,
      });

      // Clear pending alerts
      this.pendingAlerts = [];
    } catch (error) {
      logger.error({
        msg: 'Failed to send batch alert email',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate email subject
   */
  private generateSubject(alertData: EmailAlertData): string {
    const { result } = alertData;

    const severityEmoji = {
      Malicious: '🚨',
      Suspicious: '⚠️',
      Safe: '✅',
    };

    return `${severityEmoji[result.verdict]} PhishLogic Alert: ${result.verdict} (Score: ${result.score}/10)`;
  }

  /**
   * Generate HTML email body
   */
  private generateHtmlBody(alertData: EmailAlertData): string {
    const { input, result } = alertData;

    const inputDisplay = isUrlInput(input)
      ? `<strong>URL:</strong> <a href="${input.data.url}">${input.data.url}</a>`
      : isEmailInput(input)
        ? `<strong>From:</strong> ${input.data.parsed.from.address}<br><strong>Subject:</strong> ${input.data.parsed.subject}`
        : '';

    const redFlagsHtml = result.redFlags.length > 0
      ? `
        <h3>⚠️ Signals:</h3>
        <ul>
          ${result.redFlags.map((flag) => `<li><strong>[${flag.category}]</strong> ${flag.message}</li>`).join('')}
        </ul>
      `
      : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: ${result.verdict === 'Malicious' ? '#dc3545' : '#ffc107'}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
            .score { font-size: 48px; font-weight: bold; margin: 10px 0; }
            .verdict { font-size: 24px; font-weight: bold; }
            .alert-level { display: inline-block; padding: 5px 10px; border-radius: 4px; background-color: ${result.alertLevel === 'high' ? '#dc3545' : result.alertLevel === 'medium' ? '#ffc107' : '#28a745'}; color: white; }
            ul { padding-left: 20px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; font-size: 12px; color: #6c757d; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="verdict">${result.verdict}</div>
              <div class="score">${result.score}/10</div>
              <div class="alert-level">${result.alertLevel.toUpperCase()} Priority</div>
            </div>
            <div class="content">
              <h3>Analysis Details:</h3>
              <p>${inputDisplay}</p>

              <h3>Reasoning:</h3>
              <p>${result.reasoning}</p>

              ${redFlagsHtml}

              <h3>Analysis Metadata:</h3>
              <ul>
                <li><strong>Analysis ID:</strong> ${result.metadata.analysisId}</li>
                <li><strong>Duration:</strong> ${result.metadata.duration}ms</li>
                <li><strong>Timestamp:</strong> ${result.metadata.timestamp}</li>
                <li><strong>Analyzers Run:</strong> ${result.metadata.analyzersRun.join(', ')}</li>
              </ul>
            </div>
            <div class="footer">
              <p>This is an automated alert from PhishLogic phishing detection system.</p>
              <p>Generated with <a href="https://claude.com/claude-code">Claude Code</a></p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate plain text email body
   */
  private generateTextBody(alertData: EmailAlertData): string {
    const { input, result } = alertData;

    const inputDisplay = isUrlInput(input)
      ? `URL: ${input.data.url}`
      : isEmailInput(input)
        ? `From: ${input.data.parsed.from.address}\nSubject: ${input.data.parsed.subject}`
        : '';

    const redFlagsText = result.redFlags.length > 0
      ? `\nSignals:\n${result.redFlags.map((flag) => `  - [${flag.category}] ${flag.message}`).join('\n')}`
      : '';

    return `
PhishLogic Security Alert

VERDICT: ${result.verdict}
SCORE: ${result.score}/10
ALERT LEVEL: ${result.alertLevel.toUpperCase()}

Analysis Details:
${inputDisplay}

Reasoning:
${result.reasoning}
${redFlagsText}

Analysis Metadata:
- Analysis ID: ${result.metadata.analysisId}
- Duration: ${result.metadata.duration}ms
- Timestamp: ${result.metadata.timestamp}
- Analyzers Run: ${result.metadata.analyzersRun.join(', ')}

---
This is an automated alert from PhishLogic phishing detection system.
    `.trim();
  }

  /**
   * Generate batch HTML body
   */
  private generateBatchHtmlBody(alerts: EmailAlertData[]): string {
    const alertsHtml = alerts.map((alert, index) => {
      const inputDisplay = isUrlInput(alert.input)
        ? `URL: ${alert.input.data.url}`
        : isEmailInput(alert.input)
          ? `From: ${alert.input.data.parsed.from.address}, Subject: ${alert.input.data.parsed.subject}`
          : '';

      return `
        <div style="margin-bottom: 20px; padding: 15px; background-color: white; border-left: 4px solid ${alert.result.verdict === 'Malicious' ? '#dc3545' : '#ffc107'}; border-radius: 4px;">
          <h4>Alert #${index + 1} - ${alert.result.verdict} (${alert.result.score}/10)</h4>
          <p>${inputDisplay}</p>
          <p><strong>Reasoning:</strong> ${alert.result.reasoning}</p>
          <p><em>${alert.timestamp.toLocaleString()}</em></p>
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 700px; margin: 0 auto; padding: 20px; }
            .header { background-color: #343a40; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>PhishLogic Security Alerts</h2>
              <p>${alerts.length} alert${alerts.length > 1 ? 's' : ''} detected</p>
            </div>
            <div class="content">
              ${alertsHtml}
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate batch text body
   */
  private generateBatchTextBody(alerts: EmailAlertData[]): string {
    const alertsText = alerts.map((alert, index) => {
      const inputDisplay = isUrlInput(alert.input)
        ? `URL: ${alert.input.data.url}`
        : isEmailInput(alert.input)
          ? `From: ${alert.input.data.parsed.from.address}, Subject: ${alert.input.data.parsed.subject}`
          : '';

      return `
Alert #${index + 1} - ${alert.result.verdict} (${alert.result.score}/10)
${inputDisplay}
Reasoning: ${alert.result.reasoning}
Time: ${alert.timestamp.toLocaleString()}
      `.trim();
    }).join('\n\n---\n\n');

    return `
PhishLogic Security Alerts - Batch Report

${alerts.length} alert${alerts.length > 1 ? 's' : ''} detected:

${alertsText}

---
This is an automated batch alert from PhishLogic phishing detection system.
    `.trim();
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // Send any pending alerts before cleanup
    if (this.pendingAlerts.length > 0) {
      await this.sendBatchAlert();
    }

    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }

    logger.info('EmailService cleaned up');
  }
}

/**
 * Singleton instance
 */
let emailServiceInstance: EmailService | null = null;

/**
 * Get or create email service instance
 */
export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}

/**
 * Reset email service (useful for testing)
 */
export function resetEmailService(): void {
  if (emailServiceInstance) {
    emailServiceInstance.cleanup().catch((error) => {
      logger.error({
        msg: 'Error cleaning up email service',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
  emailServiceInstance = null;
}
