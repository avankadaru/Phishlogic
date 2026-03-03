/**
 * Integration tests for whitelist API endpoints
 */

import type { FastifyInstance } from 'fastify';
import { createServer } from '../../../src/api/server.js';
import { getWhitelistService } from '../../../src/core/services/whitelist.service.js';

describe('Whitelist API', () => {
  let server: FastifyInstance;
  const whitelistService = getWhitelistService();

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Clear whitelist before each test
    whitelistService.clear();
  });

  describe('GET /api/v1/whitelist', () => {
    it('should return empty list initially', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/whitelist',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.entries).toBeInstanceOf(Array);
      expect(body.entries.length).toBe(0);
      expect(body.count).toBe(0);
    });

    it('should return added entries', async () => {
      whitelistService.addEntry({
        type: 'email',
        value: 'test@example.com',
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/whitelist',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.entries.length).toBe(1);
      expect(body.count).toBe(1);
      expect(body.entries[0].type).toBe('email');
      expect(body.entries[0].value).toBe('test@example.com');
    });
  });

  describe('POST /api/v1/whitelist', () => {
    it('should add email whitelist entry', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/whitelist',
        payload: {
          type: 'email',
          value: 'safe@example.com',
          description: 'Test email',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.type).toBe('email');
      expect(body.value).toBe('safe@example.com');
      expect(body.description).toBe('Test email');
      expect(body.active).toBe(true);
    });

    it('should add domain whitelist entry', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/whitelist',
        payload: {
          type: 'domain',
          value: 'example.com',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('domain');
      expect(body.value).toBe('example.com');
    });

    it('should add URL whitelist entry', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/whitelist',
        payload: {
          type: 'url',
          value: 'https://safe.com/page',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.type).toBe('url');
      expect(body.value).toBe('https://safe.com/page');
    });
  });

  describe('GET /api/v1/whitelist/:id', () => {
    it('should get whitelist entry by ID', async () => {
      const entry = whitelistService.addEntry({
        type: 'email',
        value: 'test@example.com',
      });

      const response = await server.inject({
        method: 'GET',
        url: `/api/v1/whitelist/${entry.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(entry.id);
      expect(body.value).toBe('test@example.com');
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/whitelist/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/whitelist/:id', () => {
    it('should delete whitelist entry', async () => {
      const entry = whitelistService.addEntry({
        type: 'email',
        value: 'test@example.com',
      });

      const response = await server.inject({
        method: 'DELETE',
        url: `/api/v1/whitelist/${entry.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verify entry is deleted
      const getResponse = await server.inject({
        method: 'GET',
        url: `/api/v1/whitelist/${entry.id}`,
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 when deleting non-existent entry', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/api/v1/whitelist/non-existent-id',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/whitelist/stats', () => {
    it('should return statistics', async () => {
      whitelistService.addEntry({ type: 'email', value: 'test1@example.com' });
      whitelistService.addEntry({ type: 'email', value: 'test2@example.com' });
      whitelistService.addEntry({ type: 'domain', value: 'example.com' });

      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/whitelist/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total).toBe(3);
      expect(body.active).toBe(3);
      expect(body.byType.email).toBe(2);
      expect(body.byType.domain).toBe(1);
      expect(body.byType.url).toBe(0);
    });
  });

  describe('Whitelist bypass in analysis', () => {
    it('should bypass analysis for whitelisted URL', async () => {
      whitelistService.addEntry({
        type: 'url',
        value: 'https://safe.com',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'https://safe.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.verdict).toBe('Safe');
      expect(body.score).toBe(0);
      expect(body.reasoning).toContain('trusted source');
      expect(body.metadata.analyzersRun).toHaveLength(0);
    });

    it('should bypass analysis for whitelisted email domain', async () => {
      whitelistService.addEntry({
        type: 'domain',
        value: 'trusted.com',
      });

      const sampleEmail = `From: sender@trusted.com
To: recipient@example.com
Subject: Test Email
Content-Type: text/plain

This is a test email.`;

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/email',
        payload: {
          rawEmail: sampleEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.verdict).toBe('Safe');
      expect(body.score).toBe(0);
      expect(body.reasoning).toContain('trusted source');
      expect(body.metadata.analyzersRun).toHaveLength(0);
    });
  });
});
