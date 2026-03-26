import { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware.js';

// Import controllers
// Task-config controller removed - replaced with integration-tasks controller

import {
  getCostSummary,
  getCostBreakdown,
  getTopConsumers,
  updateBudget,
} from '../controllers/admin/cost.controller.js';

import {
  getRecentAnalyses,
  getAnalysisById,
  getRecentErrors,
  getSystemStats,
  getHealthCheck,
} from '../controllers/admin/debug.controller.js';

import {
  getAllNotifications,
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification,
  testNotification,
} from '../controllers/admin/notification.controller.js';

import {
  getAllSettings,
  getSetting,
  updateSetting,
  bulkUpdateSettings,
  deleteSetting,
  getSettingsByCategory,
} from '../controllers/admin/system-settings.controller.js';

import {
  getAllWhitelistEntries,
  getWhitelistEntry,
  addWhitelistEntry,
  updateWhitelistEntry,
  deleteWhitelistEntry,
  activateWhitelistEntry,
  deactivateWhitelistEntry,
  getWhitelistStats,
} from '../controllers/admin/whitelist.controller.js';

import {
  getAIModels,
  getAIModel,
  createAIModel,
  updateAIModel,
  deleteAIModel,
  testAIModel,
} from '../controllers/admin/ai-models.controller.js';

import {
  getPromptTemplates,
  getPromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  previewPromptTemplate,
} from '../controllers/admin/prompt-templates.controller.js';

import {
  createSupportRequest,
  getSupportRequests,
  getSupportRequest,
  updateSupportRequest,
  getSupportStats,
} from '../controllers/admin/support.controller.js';

import {
  getAllIntegrationTasks,
  getIntegrationTask,
  updateIntegrationTask,
  getIntegrationAnalyzers,
  addIntegrationAnalyzer,
  updateIntegrationAnalyzer,
  deleteIntegrationAnalyzer,
} from '../controllers/admin/integration-tasks.controller.js';

import {
  listCredentials,
  getCredential,
  createCredential,
  updateCredential,
  deleteCredential,
  testCredential,
} from '../controllers/admin/credentials.controller.js';

import {
  getAllTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getTaskAnalyzers,
} from '../controllers/admin/tasks.controller.js';

import {
  getAllAnalyzers,
  getAnalyzer,
  createAnalyzer,
  updateAnalyzer,
  deleteAnalyzer,
  getAnalyzerTasks,
  assignAnalyzerToTask,
  removeAnalyzerFromTask,
} from '../controllers/admin/analyzers.controller.js';

/**
 * Admin panel routes
 * All routes require admin authentication
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all admin routes
  fastify.addHook('preHandler', authMiddleware);
  fastify.addHook('preHandler', requireAdmin);

  // Integration Task Routes (Gmail, Chrome, etc.) - replaces old task routes
  fastify.get('/admin/integration-tasks', getAllIntegrationTasks);
  fastify.get('/admin/integration-tasks/:integrationName', getIntegrationTask);
  fastify.put('/admin/integration-tasks/:integrationName', updateIntegrationTask);

  // Integration Analyzer Routes (CRUD for analyzers within an integration)
  fastify.get('/admin/integration-tasks/:integrationName/analyzers', getIntegrationAnalyzers);
  fastify.post('/admin/integration-tasks/:integrationName/analyzers', addIntegrationAnalyzer);
  fastify.put('/admin/integration-tasks/:integrationName/analyzers/:analyzerName', updateIntegrationAnalyzer);
  fastify.delete('/admin/integration-tasks/:integrationName/analyzers/:analyzerName', deleteIntegrationAnalyzer);

  // Backward compatibility alias
  fastify.get('/admin/tasks', getAllIntegrationTasks);

  // Cost Analytics Routes
  fastify.get('/admin/costs/summary', getCostSummary);
  fastify.get('/admin/costs/breakdown', getCostBreakdown);
  fastify.get('/admin/costs/top-consumers', getTopConsumers);
  fastify.put('/admin/costs/budget', updateBudget);

  // Debug Interface Routes
  fastify.get('/admin/debug/analyses', getRecentAnalyses);
  fastify.get('/admin/debug/analyses/:id', getAnalysisById);
  fastify.get('/admin/debug/errors', getRecentErrors);
  fastify.get('/admin/debug/stats', getSystemStats);
  fastify.get('/admin/debug/health', getHealthCheck);

  // Notification Configuration Routes
  fastify.get('/admin/notifications', getAllNotifications);
  fastify.get('/admin/notifications/:id', getNotification);
  fastify.post('/admin/notifications', createNotification);
  fastify.put('/admin/notifications/:id', updateNotification);
  fastify.delete('/admin/notifications/:id', deleteNotification);
  fastify.post('/admin/notifications/:id/test', testNotification);

  // System Settings Routes
  fastify.get('/admin/settings', getAllSettings);
  fastify.get('/admin/settings/categories', getSettingsByCategory);
  fastify.get('/admin/settings/:key', getSetting);
  fastify.put('/admin/settings/:key', updateSetting);
  fastify.put('/admin/settings', bulkUpdateSettings);
  fastify.delete('/admin/settings/:key', deleteSetting);

  // Whitelist Management Routes
  fastify.get('/admin/whitelist', getAllWhitelistEntries);
  fastify.get('/admin/whitelist/stats', getWhitelistStats);
  fastify.get('/admin/whitelist/:id', getWhitelistEntry);
  fastify.post('/admin/whitelist', addWhitelistEntry);
  fastify.put('/admin/whitelist/:id', updateWhitelistEntry);
  fastify.delete('/admin/whitelist/:id', deleteWhitelistEntry);
  fastify.post('/admin/whitelist/:id/activate', activateWhitelistEntry);
  fastify.post('/admin/whitelist/:id/deactivate', deactivateWhitelistEntry);

  // AI Model Configuration Routes
  fastify.get('/admin/ai-models', getAIModels);
  fastify.get('/admin/ai-models/:id', getAIModel);
  fastify.post('/admin/ai-models', createAIModel);
  fastify.put('/admin/ai-models/:id', updateAIModel);
  fastify.delete('/admin/ai-models/:id', deleteAIModel);
  fastify.post('/admin/ai-models/:id/test', testAIModel);

  // Prompt Templates Routes
  fastify.get('/admin/prompt-templates', getPromptTemplates);
  fastify.get('/admin/prompt-templates/:id', getPromptTemplate);
  fastify.post('/admin/prompt-templates', createPromptTemplate);
  fastify.put('/admin/prompt-templates/:id', updatePromptTemplate);
  fastify.delete('/admin/prompt-templates/:id', deletePromptTemplate);
  fastify.post('/admin/prompt-templates/:id/preview', previewPromptTemplate);

  // API Credentials Management Routes
  fastify.get('/admin/credentials', listCredentials);
  fastify.get('/admin/credentials/:id', getCredential);
  fastify.post('/admin/credentials', createCredential);
  fastify.put('/admin/credentials/:id', updateCredential);
  fastify.delete('/admin/credentials/:id', deleteCredential);
  fastify.post('/admin/credentials/:id/test', testCredential);

  // Task Definitions Routes
  fastify.get('/admin/tasks/definitions', getAllTasks);
  fastify.get('/admin/tasks/definitions/:taskName', getTask);
  fastify.post('/admin/tasks/definitions', createTask);
  fastify.put('/admin/tasks/definitions/:taskName', updateTask);
  fastify.delete('/admin/tasks/definitions/:taskName', deleteTask);
  fastify.get('/admin/tasks/definitions/:taskName/analyzers', getTaskAnalyzers);

  // Analyzer Definitions Routes
  fastify.get('/admin/analyzers', getAllAnalyzers);
  fastify.get('/admin/analyzers/:analyzerName', getAnalyzer);
  fastify.post('/admin/analyzers', createAnalyzer);
  fastify.put('/admin/analyzers/:analyzerName', updateAnalyzer);
  fastify.delete('/admin/analyzers/:analyzerName', deleteAnalyzer);
  fastify.get('/admin/analyzers/:analyzerName/tasks', getAnalyzerTasks);
  fastify.post('/admin/analyzers/:analyzerName/assign-task', assignAnalyzerToTask);
  fastify.delete('/admin/analyzers/:analyzerName/tasks/:taskName', removeAnalyzerFromTask);

  // Support Request Routes
  fastify.post('/admin/support', createSupportRequest);
  fastify.get('/admin/support', getSupportRequests);
  fastify.get('/admin/support/stats', getSupportStats);
  fastify.get('/admin/support/:id', getSupportRequest);
  fastify.put('/admin/support/:id', updateSupportRequest);
}
