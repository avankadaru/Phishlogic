/**
 * Tests for whitelist controller
 */

import {
  getAllWhitelistEntries,
  addWhitelistEntry,
  deleteWhitelistEntry,
  getWhitelistStats,
} from '../../../src/api/controllers/admin/whitelist.controller.js';
import {
  createMockRequest,
  createMockReply,
  createMockAdminUser,
  mockQuery,
  createMockQueryResult,
  resetMocks,
} from './test-helpers.js';

// Mock WhitelistService
const mockWhitelistService = {
  getAllEntries: jest.fn(),
  getActiveEntries: jest.fn(),
  getEntriesByType: jest.fn(),
  getEntry: jest.fn(),
  addEntry: jest.fn(),
  removeEntry: jest.fn(),
  activateEntry: jest.fn(),
  deactivateEntry: jest.fn(),
  getStats: jest.fn(),
};

jest.mock('../../../src/core/services/whitelist.service.js', () => ({
  getWhitelistService: () => mockWhitelistService,
}));

describe('Whitelist Controller', () => {
  beforeEach(() => {
    resetMocks();
    jest.clearAllMocks();
  });

  describe('getAllWhitelistEntries', () => {
    it('should get all whitelist entries', async () => {
      const entries = [
        {
          id: '1',
          type: 'domain',
          value: 'google.com',
          description: 'Google',
          addedAt: new Date(),
          active: true,
        },
      ];

      mockWhitelistService.getAllEntries.mockResolvedValue(entries);

      const request = createMockRequest({
        query: {},
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await getAllWhitelistEntries(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].value).toBe('google.com');
    });

    it('should filter by type', async () => {
      const entries = [
        {
          id: '1',
          type: 'email',
          value: 'admin@example.com',
          addedAt: new Date(),
          active: true,
        },
      ];

      mockWhitelistService.getEntriesByType.mockResolvedValue(entries);

      const request = createMockRequest({
        query: { type: 'email' },
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await getAllWhitelistEntries(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data[0].type).toBe('email');
      expect(mockWhitelistService.getEntriesByType).toHaveBeenCalledWith('email');
    });
  });

  describe('addWhitelistEntry', () => {
    it('should add whitelist entry', async () => {
      const newEntry = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'domain',
        value: 'example.com',
        description: 'Example domain',
        addedAt: new Date(),
        active: true,
      };

      mockWhitelistService.addEntry.mockResolvedValue(newEntry);
      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        body: {
          type: 'domain',
          value: 'example.com',
          description: 'Example domain',
        },
        user: createMockAdminUser(),
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await addWhitelistEntry(request as any, reply as any);

      expect(getStatus()).toBe(201);
      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data.value).toBe('example.com');
    });
  });

  describe('deleteWhitelistEntry', () => {
    it('should delete whitelist entry', async () => {
      const entry = {
        id: '1',
        type: 'domain',
        value: 'example.com',
      };

      mockWhitelistService.getEntry.mockResolvedValue(entry);
      mockWhitelistService.removeEntry.mockResolvedValue(true);
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        params: { id: '1' },
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await deleteWhitelistEntry(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Whitelist entry deleted');
    });
  });

  describe('getWhitelistStats', () => {
    it('should get whitelist statistics', async () => {
      const stats = {
        total: 10,
        active: 8,
        byType: { email: 3, domain: 5, url: 2 },
      };

      const topMatched = [
        {
          id: '1',
          type: 'domain',
          value: 'google.com',
          match_count: '100',
          last_matched_at: new Date(),
        },
      ];

      mockWhitelistService.getStats.mockResolvedValue(stats);
      mockQuery.mockResolvedValueOnce(createMockQueryResult(topMatched));

      const request = createMockRequest({
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await getWhitelistStats(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(10);
      expect(data.data.active).toBe(8);
      expect(data.data.topMatched).toHaveLength(1);
    });
  });
});
