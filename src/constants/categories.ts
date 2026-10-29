/**
 * Category names and metadata mappings for Adobe Stock, Shutterstock, and Dreamstime
 */

export const ADOBE_CATEGORIES: Record<number, string> = {
  1: 'Animals',
  2: 'Buildings & Architecture',
  3: 'Business',
  4: 'Drinks',
  5: 'The Environment',
  6: 'States of Mind',
  7: 'Food',
  8: 'Graphic Resources',
  9: 'Hobbies & Leisure',
  10: 'Industry',
  11: 'Landscapes',
  12: 'Lifestyle',
  13: 'People',
  14: 'Plants & Flowers',
  15: 'Culture & Religion',
  16: 'Science',
  17: 'Social Issues',
  18: 'Sports',
  19: 'Technology',
  20: 'Transport',
  21: 'Travel',
};

export const DREAMSTIME_CATEGORIES: Record<number, string> = {
  101: 'Animals',
  102: 'Architecture',
  103: 'Business',
  104: 'Editorial',
  105: 'Holidays',
  106: 'Nature',
  107: 'People',
  108: 'Technology',
  109: 'Travel',
  110: 'Abstract',
  111: 'Arts & Entertainment',
  112: 'IT & C',
  113: 'Industries',
  114: 'AI Illustrations',
  115: 'Backgrounds & Textures',
  116: 'Objects',
  117: 'Vectors & Web Design',
  118: 'Medical & Health',
  119: 'Transportation',
  120: 'Science',
};

export function getAdobeCategoryName(categoryId?: number): string {
  if (!categoryId) return 'Graphic Resources (#8)';
  const name = ADOBE_CATEGORIES[categoryId];
  return name ? `${name} (#${categoryId})` : `#${categoryId}`;
}

export function getDreamstimeCategoryName(categoryId?: number): string {
  if (!categoryId) return 'AI Illustrations (#114)';
  const name = DREAMSTIME_CATEGORIES[categoryId];
  return name ? `${name} (#${categoryId})` : `#${categoryId}`;
}

export const FREEPIK_BASE_MODELS = [
  'Google Nano Banana',
  'Adobe Firefly',
  'Dall-e 1',
  'Dall-e 2',
  'Dall-e 3',
  'Flux 1.0',
  'Flux 1.0 Fast',
  'Flux 1.0 Realism',
  'Flux 1.1',
  'Flux Kontext [Max]',
  'Flux Kontext [Pro]',
  'Freepik Classic',
  'Freepik Classic Fast',
  'Freepik Flux',
  'Freepik Flux Fast',
  'Freepik Flux Realism',
  'Freepik Mystic 1.0',
  'Freepik Mystic 2.5',
  'Freepik Mystic 2.5 Flexible',
  'Freepik Mystic 2.5 Fluid',
  'Freepik Pikaso',
  'Google Imagen 3',
  'Google Imagen 4',
  'Google Imagen 4 Fast',
  'Google Imagen 4 Ultra',
  'GPT',
  'GPT 1 - HQ',
  'Ideogram 1.0',
  'Ideogram 3',
  'Leonardo',
  'Midjourney 1',
  'Midjourney 2',
  'Midjourney 3',
  'Midjourney 4',
  'Midjourney 5',
  'Midjourney 5.1',
  'Midjourney 5.2',
  'Midjourney 6',
  'niji',
  'Runway',
  'Seedream',
  'Stable Diffusion 1.4',
  'Stable Diffusion 1.5',
  'Stable Diffusion 2.0',
  'Stable Diffusion 2.1',
  'Stable Diffusion XL',
  'Wepik',
  'Other',
] as const;

export type FreepikBaseModel = (typeof FREEPIK_BASE_MODELS)[number];
