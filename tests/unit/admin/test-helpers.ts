/**
 * Test helpers for admin controller tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Mock database query function
 */
export const mockQuery = jest.fn();

// Mock the database client
jest.mock('../../../src/infrastructure/database/client.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
  initDatabase: jest.fn(),
  closeDatabase: jest.fn(),
}));

// Mock logger
jest.mock('../../../src/infrastructure/logging/logger.js', () => ({
  getLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock config
jest.mock('../../../src/config/app.config.js', () => ({
  getConfig: () => ({
    auth: {
      jwtSecret: 'test-secret-key-for-jwt-testing-purposes-min-32-chars',
      jwtExpiresIn: '1h',
    },
  }),
}));

/**
 * Create mock Fastify request
 */
export function createMockRequest(options: {
  params?: Record<string, any>;
  query?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, any>;
  user?: {
    userId: string;
    username?: string;
    role: 'admin' | 'user';
    type: 'admin' | 'api_key';
    tenantId?: string | null;
  };
}): Partial<FastifyRequest> {
  return {
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    headers: options.headers || {},
    user: options.user,
    ip: '127.0.0.1',
    id: 'test-request-id',
  };
}

/**
 * Create mock Fastify reply
 */
export function createMockReply(): {
  reply: Partial<FastifyReply>;
  getSentData: () => any;
  getStatus: () => number;
} {
  let sentData: any = null;
  let statusCode = 200;

  const reply: Partial<FastifyReply> = {
    status: jest.fn((code: number) => {
      statusCode = code;
      return reply as FastifyReply;
    }),
    send: jest.fn((data: any) => {
      sentData = data;
      return reply as FastifyReply;
    }),
  };

  return {
    reply,
    getSentData: () => sentData,
    getStatus: () => statusCode,
  };
}

/**
 * Create mock admin user
 */
export function createMockAdminUser() {
  return {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    username: 'admin',
    role: 'admin' as const,
    type: 'admin' as const,
  };
}

/**
 * Create mock regular user
 */
export function createMockUser() {
  return {
    userId: '550e8400-e29b-41d4-a716-446655440001',
    username: 'user1',
    role: 'user' as const,
    type: 'api_key' as const,
    tenantId: null,
  };
}

/**
 * Mock database query result
 */
export function createMockQueryResult(rows: any[], rowCount?: number) {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: '',
    oid: 0,
    fields: [],
  };
}

/**
 * Reset all mocks
 */
export function resetMocks() {
  mockQuery.mockReset();
  jest.clearAllMocks();
}
