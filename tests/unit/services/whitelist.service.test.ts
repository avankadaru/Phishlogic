/**
 * Whitelist service tests
 */

import { WhitelistService } from '../../../src/core/services/whitelist.service.js';
import type { NormalizedInput } from '../../../src/core/models/input.js';

describe('WhitelistService', () => {
  let service: WhitelistService;

  beforeEach(() => {
    service = new WhitelistService();
  });

  afterEach(() => {
    service.clear();
  });

  describe('addEntry', () => {
    it('should add an email whitelist entry', () => {
      const entry = service.addEntry({
        type: 'email',
        value: 'test@example.com',
        description: 'Test email',
      });

      expect(entry.id).toBeDefined();
      expect(entry.type).toBe('email');
      expect(entry.value).toBe('test@example.com');
      expect(entry.description).toBe('Test email');
      expect(entry.active).toBe(true);
    });

    it('should add a domain whitelist entry', () => {
      const entry = service.addEntry({
        type: 'domain',
        value: 'example.com',
        description: 'Test domain',
      });

      expect(entry.id).toBeDefined();
      expect(entry.type).toBe('domain');
      expect(entry.value).toBe('example.com');
    });

    it('should add a URL whitelist entry', () => {
      const entry = service.addEntry({
        type: 'url',
        value: 'https://example.com/page',
        description: 'Test URL',
      });

      expect(entry.id).toBeDefined();
      expect(entry.type).toBe('url');
      expect(entry.value).toBe('https://example.com/page');
    });

    it('should normalize email addresses to lowercase', () => {
      const entry = service.addEntry({
        type: 'email',
        value: 'Test@Example.COM',
      });

      expect(entry.value).toBe('test@example.com');
    });

    it('should normalize domains by removing www', () => {
      const entry = service.addEntry({
        type: 'domain',
        value: 'www.example.com',
      });

      expect(entry.value).toBe('example.com');
    });
  });

  describe('removeEntry', () => {
    it('should remove an entry by ID', () => {
      const entry = service.addEntry({
        type: 'email',
        value: 'test@example.com',
      });

      const removed = service.removeEntry(entry.id);
      expect(removed).toBe(true);

      const retrieved = service.getEntry(entry.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false when removing non-existent entry', () => {
      const removed = service.removeEntry('non-existent-id');
      expect(removed).toBe(false);
    });
  });

  describe('deactivateEntry and activateEntry', () => {
    it('should deactivate an entry', () => {
      const entry = service.addEntry({
        type: 'email',
        value: 'test@example.com',
      });

      const deactivated = service.deactivateEntry(entry.id);
      expect(deactivated).toBe(true);

      const retrieved = service.getEntry(entry.id);
      expect(retrieved?.active).toBe(false);
    });

    it('should activate an entry', () => {
      const entry = service.addEntry({
        type: 'email',
        value: 'test@example.com',
      });

      service.deactivateEntry(entry.id);
      const activated = service.activateEntry(entry.id);
      expect(activated).toBe(true);

      const retrieved = service.getEntry(entry.id);
      expect(retrieved?.active).toBe(true);
    });
  });

  describe('check', () => {
    it('should match whitelisted email address', () => {
      service.addEntry({
        type: 'email',
        value: 'safe@example.com',
      });

      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'safe@example.com' },
            to: [],
            subject: 'Test',
            body: {},
          },
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(true);
      expect(result.matchReason).toBe('exact email match');
    });

    it('should match whitelisted domain from email', () => {
      service.addEntry({
        type: 'domain',
        value: 'example.com',
      });

      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'anyone@example.com' },
            to: [],
            subject: 'Test',
            body: {},
          },
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(true);
      expect(result.matchReason).toBe('exact domain match');
    });

    it('should match whitelisted URL', () => {
      service.addEntry({
        type: 'url',
        value: 'https://safe.com/page',
      });

      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://safe.com/page',
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(true);
      expect(result.matchReason).toBe('exact URL match');
    });

    it('should match whitelisted URL with query params (prefix match)', () => {
      service.addEntry({
        type: 'url',
        value: 'https://safe.com/page',
      });

      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://safe.com/page?param=value',
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(true);
      expect(result.matchReason).toBe('URL prefix match');
    });

    it('should match whitelisted domain from URL', () => {
      service.addEntry({
        type: 'domain',
        value: 'example.com',
      });

      const input: NormalizedInput = {
        type: 'url',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          url: 'https://www.example.com/page',
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(true);
      expect(result.matchReason).toBe('exact domain match');
    });

    it('should not match inactive entries', () => {
      const entry = service.addEntry({
        type: 'email',
        value: 'safe@example.com',
      });

      service.deactivateEntry(entry.id);

      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'safe@example.com' },
            to: [],
            subject: 'Test',
            body: {},
          },
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(false);
    });

    it('should not match expired entries', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      service.addEntry({
        type: 'email',
        value: 'safe@example.com',
        expiresAt: pastDate,
      });

      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'safe@example.com' },
            to: [],
            subject: 'Test',
            body: {},
          },
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(false);
    });

    it('should return false for non-whitelisted input', () => {
      const input: NormalizedInput = {
        type: 'email',
        id: 'test-id',
        timestamp: new Date(),
        data: {
          raw: '',
          parsed: {
            headers: new Map(),
            from: { address: 'unknown@example.com' },
            to: [],
            subject: 'Test',
            body: {},
          },
        },
      };

      const result = service.check(input);
      expect(result.isWhitelisted).toBe(false);
      expect(result.matchedEntry).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      service.addEntry({ type: 'email', value: 'test1@example.com' });
      service.addEntry({ type: 'email', value: 'test2@example.com' });
      service.addEntry({ type: 'domain', value: 'example.com' });
      service.addEntry({ type: 'url', value: 'https://example.com' });

      const entry = service.addEntry({ type: 'email', value: 'test3@example.com' });
      service.deactivateEntry(entry.id);

      const stats = service.getStats();

      expect(stats.total).toBe(5);
      expect(stats.active).toBe(4); // One deactivated
      expect(stats.byType.email).toBe(3);
      expect(stats.byType.domain).toBe(1);
      expect(stats.byType.url).toBe(1);
    });
  });

  describe('getActiveEntries', () => {
    it('should return only active entries', () => {
      service.addEntry({ type: 'email', value: 'active@example.com' });
      const entry = service.addEntry({ type: 'email', value: 'inactive@example.com' });
      service.deactivateEntry(entry.id);

      const activeEntries = service.getActiveEntries();

      expect(activeEntries).toHaveLength(1);
      expect(activeEntries[0]?.value).toBe('active@example.com');
    });
  });

  describe('getEntriesByType', () => {
    it('should return entries filtered by type', () => {
      service.addEntry({ type: 'email', value: 'test1@example.com' });
      service.addEntry({ type: 'email', value: 'test2@example.com' });
      service.addEntry({ type: 'domain', value: 'example.com' });

      const emailEntries = service.getEntriesByType('email');
      const domainEntries = service.getEntriesByType('domain');

      expect(emailEntries).toHaveLength(2);
      expect(domainEntries).toHaveLength(1);
    });
  });
});
