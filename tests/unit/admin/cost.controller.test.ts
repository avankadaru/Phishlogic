/**
 * Tests for cost controller
 */

import {
  getCostSummary,
  getCostBreakdown,
  updateBudget,
} from '../../../src/api/controllers/admin/cost.controller.js';
import {
  createMockRequest,
  createMockReply,
  createMockAdminUser,
  mockQuery,
  createMockQueryResult,
  resetMocks,
} from './test-helpers.js';

describe('Cost Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('getCostSummary', () => {
    it('should get cost summary with budget tracking', async () => {
      const providerCosts = [
        { provider: 'anthropic', request_count: '100', total_cost: '25.50', avg_cost_per_request: '0.255', total_tokens: '50000' },
        { provider: 'openai', request_count: '50', total_cost: '15.25', avg_cost_per_request: '0.305', total_tokens: '30000' },
      ];
      const taskCosts = [
        { task_name: 'url_extraction', request_count: '80', total_cost: '20.00', avg_cost_per_request: '0.25' },
      ];
      const dailyTrend = [
        { date: '2026-03-01', request_count: '50', total_cost: '12.50' },
      ];
      const budget = { value: '1000' };

      mockQuery
        .mockResolvedValueOnce(createMockQueryResult(providerCosts))
        .mockResolvedValueOnce(createMockQueryResult(taskCosts))
        .mockResolvedValueOnce(createMockQueryResult(dailyTrend))
        .mockResolvedValueOnce(createMockQueryResult([budget]));

      const request = createMockRequest({
        query: {},
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await getCostSummary(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data.summary.totalCost).toBe(40.75);
      expect(data.data.summary.totalRequests).toBe(150);
      expect(data.data.summary.monthlyBudget).toBe(1000);
      expect(data.data.byProvider).toHaveLength(2);
    });
  });

  describe('getCostBreakdown', () => {
    it('should get detailed cost breakdown', async () => {
      const modelBreakdown = [
        {
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          task_name: 'url_extraction',
          request_count: '100',
          total_cost: '25.50',
          avg_cost: '0.255',
          min_cost: '0.10',
          max_cost: '0.50',
          total_tokens: '50000',
          avg_tokens: '500',
        },
      ];
      const modeBreakdown = [
        { execution_mode: 'hybrid', request_count: '80', total_cost: '20.00', avg_processing_time: '1500' },
      ];

      mockQuery
        .mockResolvedValueOnce(createMockQueryResult(modelBreakdown))
        .mockResolvedValueOnce(createMockQueryResult(modeBreakdown));

      const request = createMockRequest({
        query: { provider: 'anthropic' },
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await getCostBreakdown(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data.byModel).toHaveLength(1);
      expect(data.data.byModel[0].provider).toBe('anthropic');
    });
  });

  describe('updateBudget', () => {
    it('should update monthly budget', async () => {
      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([]))
        .mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        body: { monthlyBudgetUsd: 1500 },
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await updateBudget(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data.monthlyBudgetUsd).toBe(1500);
    });
  });
});
