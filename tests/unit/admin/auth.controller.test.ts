/**
 * Tests for auth controller
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  loginAdmin,
  loginUser,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyAuth,
} from '../../../src/api/controllers/auth.controller.js';
import {
  createMockRequest,
  createMockReply,
  createMockAdminUser,
  mockQuery,
  createMockQueryResult,
  resetMocks,
} from './test-helpers.js';

describe('Auth Controller', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('loginAdmin', () => {
    it('should login admin with valid credentials', async () => {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      const adminUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'admin',
        password_hash: passwordHash,
        email: 'admin@phishlogic.local',
        role: 'super_admin',
        is_active: true,
      };

      // Mock admin user lookup
      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([adminUser]))
        // Mock update last_login_at
        .mockResolvedValueOnce(createMockQueryResult([]))
        // Mock audit log insert
        .mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        body: { username: 'admin', password: 'Admin@123' },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await loginAdmin(request as any, reply as any);

      expect(getStatus()).toBe(200);
      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.username).toBe('admin');

      // Verify JWT token
      const decoded = jwt.verify(data.token, 'test-secret-key-for-jwt-testing-purposes-min-32-chars') as any;
      expect(decoded.userId).toBe(adminUser.id);
      expect(decoded.username).toBe('admin');
    });

    it('should reject invalid username', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        body: { username: 'invalid', password: 'password' },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await loginAdmin(request as any, reply as any);

      expect(getStatus()).toBe(401);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid username or password');
    });

    it('should reject invalid password', async () => {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      const adminUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'admin',
        password_hash: passwordHash,
        is_active: true,
      };

      mockQuery.mockResolvedValueOnce(createMockQueryResult([adminUser]));

      const request = createMockRequest({
        body: { username: 'admin', password: 'WrongPassword' },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await loginAdmin(request as any, reply as any);

      expect(getStatus()).toBe(401);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid username or password');
    });

    it('should reject deactivated admin', async () => {
      const passwordHash = await bcrypt.hash('Admin@123', 10);
      const adminUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        username: 'admin',
        password_hash: passwordHash,
        is_active: false,
      };

      mockQuery.mockResolvedValueOnce(createMockQueryResult([adminUser]));

      const request = createMockRequest({
        body: { username: 'admin', password: 'Admin@123' },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await loginAdmin(request as any, reply as any);

      expect(getStatus()).toBe(401);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Account is deactivated');
    });
  });

  describe('loginUser', () => {
    it('should login user with valid API key', async () => {
      const apiKey = 'pl_abcdef1234567890123456789012345678901234';
      const keyHash = await bcrypt.hash(apiKey, 10);
      const keyRecord = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Test Key',
        user_name: 'John Doe',
        user_email: 'john@example.com',
        key_hash: keyHash,
        is_active: true,
        expires_at: null,
      };

      // Mock API key lookup
      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([keyRecord]))
        // Mock update last_used_at
        .mockResolvedValueOnce(createMockQueryResult([]))
        // Mock audit log
        .mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        body: { apiKey },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await loginUser(request as any, reply as any);

      expect(getStatus()).toBe(200);
      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.apiKey).toBe(apiKey);
      expect(data.user.name).toBe('John Doe');
    });

    it('should reject invalid API key', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        body: { apiKey: 'pl_invalid123' },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await loginUser(request as any, reply as any);

      expect(getStatus()).toBe(401);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid API key');
    });

    it('should reject expired API key', async () => {
      const apiKey = 'pl_abcdef1234567890123456789012345678901234';
      const keyHash = await bcrypt.hash(apiKey, 10);
      const keyRecord = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        key_hash: keyHash,
        is_active: true,
        expires_at: new Date('2020-01-01'),
      };

      mockQuery.mockResolvedValueOnce(createMockQueryResult([keyRecord]));

      const request = createMockRequest({
        body: { apiKey },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await loginUser(request as any, reply as any);

      expect(getStatus()).toBe(401);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('API key has expired');
    });
  });

  describe('createApiKey', () => {
    it('should create API key as admin', async () => {
      const newKeyRecord = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'API Key for John Doe',
        user_name: 'John Doe',
        user_email: 'john@example.com',
        key_prefix: 'pl_abcdef1',
        expires_at: null,
        created_at: new Date(),
      };

      // Mock API key insert
      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([newKeyRecord]))
        // Mock audit log
        .mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        body: {
          userName: 'John Doe',
          userEmail: 'john@example.com',
        },
        user: createMockAdminUser(),
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await createApiKey(request as any, reply as any);

      expect(getStatus()).toBe(200);
      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.apiKey).toMatch(/^pl_[a-f0-9]{40}$/);
      expect(data.keyInfo.user_name).toBe('John Doe');
    });

    it('should reject non-admin users', async () => {
      const request = createMockRequest({
        body: { userName: 'John Doe' },
        user: { userId: '123', username: 'user', role: 'user', type: 'api_key' },
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await createApiKey(request as any, reply as any);

      expect(getStatus()).toBe(403);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Forbidden: Admin access required');
    });
  });

  describe('listApiKeys', () => {
    it('should list all API keys as admin', async () => {
      const apiKeys = [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Key 1',
          user_name: 'User 1',
          key_prefix: 'pl_abc',
          is_active: true,
          created_at: new Date(),
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          name: 'Key 2',
          user_name: 'User 2',
          key_prefix: 'pl_def',
          is_active: true,
          created_at: new Date(),
        },
      ];

      mockQuery.mockResolvedValueOnce(createMockQueryResult(apiKeys));

      const request = createMockRequest({
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await listApiKeys(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].user_name).toBe('User 1');
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke API key as admin', async () => {
      const keyRecord = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        user_name: 'John Doe',
      };

      // Mock get key info
      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([keyRecord]))
        // Mock soft delete
        .mockResolvedValueOnce(createMockQueryResult([]))
        // Mock audit log
        .mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        params: { id: '550e8400-e29b-41d4-a716-446655440001' },
        user: createMockAdminUser(),
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await revokeApiKey(request as any, reply as any);

      expect(getStatus()).toBe(200);
      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.message).toBe('API key revoked successfully');
    });

    it('should return 404 for non-existent key', async () => {
      mockQuery.mockResolvedValueOnce(createMockQueryResult([]));

      const request = createMockRequest({
        params: { id: 'non-existent' },
        user: createMockAdminUser(),
      });
      const { reply, getSentData, getStatus } = createMockReply();

      await revokeApiKey(request as any, reply as any);

      expect(getStatus()).toBe(404);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('API key not found');
    });
  });

  describe('verifyAuth', () => {
    it('should verify authenticated user', async () => {
      const request = createMockRequest({
        user: createMockAdminUser(),
      });
      const { reply, getSentData } = createMockReply();

      await verifyAuth(request as any, reply as any);

      const data = getSentData();
      expect(data.success).toBe(true);
      expect(data.user.username).toBe('admin');
    });

    it('should reject unauthenticated request', async () => {
      const request = createMockRequest({});
      const { reply, getSentData, getStatus } = createMockReply();

      await verifyAuth(request as any, reply as any);

      expect(getStatus()).toBe(401);
      const data = getSentData();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not authenticated');
    });
  });
});
