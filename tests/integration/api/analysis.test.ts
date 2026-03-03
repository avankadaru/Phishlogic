/**
 * Integration tests for analysis API endpoints
 */

import type { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/api/server.js';

describe('Analysis API', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/v1/analyze/url', () => {
    it('should analyze a legitimate URL', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'https://www.google.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.verdict).toBeDefined();
      expect(body.score).toBeGreaterThanOrEqual(0);
      expect(body.score).toBeLessThanOrEqual(10);
      expect(body.alertLevel).toBeDefined();
      expect(body.redFlags).toBeInstanceOf(Array);
      expect(body.reasoning).toBeDefined();
      expect(body.metadata).toBeDefined();
      expect(body.metadata.analysisId).toBeDefined();
    });

    it('should detect suspicious URL with high entropy', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'https://a8d9f2k3j4h5g6l7m9n0p1q2r3s4t5u6v7w8x9y0.com/login',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.signals.length).toBeGreaterThan(0);
    });

    it('should detect URL with suspicious TLD', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'https://example.tk/page',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const suspiciousTldSignal = body.signals.find(
        (s: { signalType: string }) => s.signalType === 'suspicious_tld'
      );
      expect(suspiciousTldSignal).toBeDefined();
    });

    it('should detect URL shortener', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'https://bit.ly/test123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const shortenerSignal = body.signals.find(
        (s: { signalType: string }) => s.signalType === 'url_shortener'
      );
      expect(shortenerSignal).toBeDefined();
    });

    it('should detect missing HTTPS', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'http://example.com/page',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const httpsSignal = body.signals.find(
        (s: { signalType: string }) => s.signalType === 'https_missing'
      );
      expect(httpsSignal).toBeDefined();
    });

    it('should reject invalid URL', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'not-a-valid-url',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should reject missing URL', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/analyze/email', () => {
    const sampleEmail = `From: sender@example.com
To: recipient@example.com
Subject: Test Email
Content-Type: text/plain

This is a test email with a link: https://example.com`;

    it('should analyze an email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: sampleEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.verdict).toBeDefined();
      expect(body.score).toBeGreaterThanOrEqual(0);
      expect(body.score).toBeLessThanOrEqual(10);
      expect(body.alertLevel).toBeDefined();
      expect(body.metadata).toBeDefined();
    });

    it('should reject empty email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should reject missing email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
