import type {
  AIModelConfig,
  CreateAIModelParams,
  UpdateAIModelParams,
} from '../repositories/ai-model.repository.interface.js';

/**
 * AI Model Service Interface
 * Defines business logic operations
 */
export interface IAIModelService {
  getAllModels(): Promise<AIModelConfig[]>;
  getModelById(id: string): Promise<AIModelConfig | null>;
  createModel(params: CreateAIModelParams): Promise<{ success: boolean; data?: AIModelConfig; error?: string }>;
  updateModel(id: string, params: UpdateAIModelParams): Promise<{ success: boolean; data?: AIModelConfig; error?: string }>;
  deleteModel(id: string): Promise<{ success: boolean; error?: string }>;
  testConnection(id: string): Promise<{ success: boolean; latency?: number; error?: string }>;
}
