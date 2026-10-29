import { ModelInfo, ProviderType } from '../../types';

export interface ProviderTestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  warning?: string;
  statusCode?: number;
  modelUsed: string;
}

export interface IVisionProvider {
  readonly providerId: ProviderType;
  testKey(apiKey: string, modelId?: string): Promise<ProviderTestResult>;
  fetchModels(apiKey: string): Promise<ModelInfo[]>;
  analyzeImage(
    apiKey: string,
    modelId: string,
    imageBase64: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<string>;
}
