/**
 * Test setup and global configuration
 */

process.env['JWT_SECRET'] =
  process.env['JWT_SECRET'] || 'test-jwt-secret-minimum-32-characters-long-for-ci';

export {};
