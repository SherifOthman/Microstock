import { ProviderMeta, ProviderType } from '../types';

export const PROVIDERS_META: Record<ProviderType, ProviderMeta> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'High-speed multimodal models with generous free tier (15 RPM / 1,500 RPD per key).',
    badge: 'Fast & Generous',
    defaultModelId: 'gemini-3.1-flash-lite',
    recommendedVisionModels: [
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
    ],
    defaultRpm: 15,
    defaultRpd: 1500,
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    supportsDynamicModels: true,
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified AI gateway aggregating multiple free and low-cost vision providers.',
    badge: 'Aggregator',
    defaultModelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    recommendedVisionModels: [
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'nvidia/nemotron-3.5-super-vl:free',
      'dots-studio/dots-3-note-preview:free',
      'openrouter/free',
    ],
    defaultRpm: 20,
    defaultRpd: 1000,
    docsUrl: 'https://openrouter.ai/docs',
    signupUrl: 'https://openrouter.ai/keys',
    supportsDynamicModels: true,
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    description: 'LPU-accelerated ultra-low latency vision inference powered by Groq.',
    badge: 'Ultra Fast',
    defaultModelId: 'qwen/qwen3.8-27b',
    recommendedVisionModels: [
      'qwen/qwen3.8-27b',
    ],
    defaultRpm: 30,
    defaultRpd: 14400,
    docsUrl: 'https://console.groq.com/docs/models',
    signupUrl: 'https://console.groq.com/keys',
    supportsDynamicModels: true,
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Pixtral multimodal vision architectures with powerful European precision.',
    badge: 'Multimodal Pixtral',
    defaultModelId: 'pixtral-12b-2409',
    recommendedVisionModels: [
      'pixtral-12b-2409',
      'pixtral-large-2411',
    ],
    defaultRpm: 10,
    defaultRpd: 1000,
    docsUrl: 'https://docs.mistral.ai/capabilities/vision/',
    signupUrl: 'https://console.mistral.ai/api-keys/',
    supportsDynamicModels: true,
  },
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    description: 'Serverless global edge inference for vision models.',
    badge: 'Edge Powered',
    defaultModelId: '@cf/meta/llama-3.2-11b-vision-instruct',
    recommendedVisionModels: [
      '@cf/meta/llama-3.2-11b-vision-instruct',
      '@cf/llava-hf/llava-1.5-7b-hf',
    ],
    defaultRpm: 30,
    defaultRpd: 5000,
    docsUrl: 'https://developers.cloudflare.com/workers-ai/',
    signupUrl: 'https://dash.cloudflare.com/',
    supportsDynamicModels: true,
  },
};

export const PROVIDER_ORDER: ProviderType[] = ['gemini', 'groq', 'openrouter', 'mistral', 'cloudflare'];

// User-friendly display names for models with verified capacities
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Google Gemini Free Tier
  'gemini-3.1-flash-lite': 'Gemini 3.1 Lite (15 RPM Free)',
  'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Lite Preview (Free)',
  'gemini-3.8-flash': 'Gemini 3.8 Flash (15 RPM Free)',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite (Free)',
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  
  // OpenRouter Free Vision Models (Active Live Verified)
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 'Nemotron 3 Nano Omni (OpenRouter Free)',
  'nvidia/nemotron-3.5-super-vl:free': 'Nemotron 3.5 Super VL (OpenRouter Free)',
  'dots-studio/dots-3-note-preview:free': 'Dots3-Note Vision (OpenRouter Free)',
  'openrouter/free': 'OpenRouter Free Router (Auto)',

  // Groq Cloud (Multimodal Vision)
  'qwen/qwen3.8-27b': 'Qwen 3.8 27B Vision (30 RPM Free)',

  // Mistral AI
  'pixtral-12b-2409': 'Pixtral 12B (Free Tier)',
  'pixtral-large-2411': 'Pixtral Large',

  // Cloudflare Workers AI
  '@cf/meta/llama-3.2-11b-vision-instruct': 'Llama 3.2 11B Vision (Cloudflare Workers AI)',
  '@cf/llava-hf/llava-1.5-7b-hf': 'LLaVA 1.5 7B Vision (Cloudflare Workers AI)',
};

// 64x64 valid PNG (white square) to satisfy minimum dimension requirements (e.g. >= 32px) on all vision providers
export const TEST_PIXEL_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAPElEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4GzcwAAGR9W3mAAAAAElFTkSuQmCC';
