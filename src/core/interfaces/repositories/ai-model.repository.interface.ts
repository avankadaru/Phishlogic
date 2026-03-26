/**
 * AI Model Repository Interface
 * Defines contract for AI model data access
 * Following Interface Segregation Principle (ISP) - only necessary methods
 */
export interface IAIModelRepository {
  findById(id: string): Promise<AIModelConfig | null>;
  findAll(): Promise<AIModelConfig[]>;
  findByName(name: string): Promise<AIModelConfig | null>;
  create(params: CreateAIModelParams): Promise<AIModelConfig>;
  update(id: string, params: UpdateAIModelParams): Promise<AIModelConfig | null>;
  delete(id: string): Promise<boolean>;
  checkUsage(id: string): Promise<number>;
}

export interface AIModelConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'custom';
  modelId: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
  promptTemplateId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  usageCount?: number;
}

export interface CreateAIModelParams {
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'custom';
  modelId?: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  promptTemplateId?: string;
}

export interface UpdateAIModelParams {
  name?: string;
  provider?: 'anthropic' | 'openai' | 'google' | 'custom';
  modelId?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  promptTemplateId?: string;
}
