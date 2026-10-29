import { ProviderType } from '../../types';
import { IVisionProvider } from './types';
import { GeminiAdapter } from './gemini';
import { OpenRouterAdapter } from './openrouter';
import { GroqAdapter } from './groq';
import { MistralAdapter } from './mistral';
import { CloudflareAdapter } from './cloudflare';

export * from './types';
export * from './gemini';
export * from './openrouter';
export * from './groq';
export * from './mistral';
export * from './cloudflare';

const adapters: Record<ProviderType, IVisionProvider> = {
  gemini: new GeminiAdapter(),
  openrouter: new OpenRouterAdapter(),
  groq: new GroqAdapter(),
  mistral: new MistralAdapter(),
  cloudflare: new CloudflareAdapter(),
};

export function getProviderAdapter(providerId: ProviderType): IVisionProvider {
  const adapter = adapters[providerId];
  if (!adapter) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  return adapter;
}
