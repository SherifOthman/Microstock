/**
 * Official Adobe Stock Category Mapping
 * Numeric ID (1-21) to official category string
 */
export const ADOBE_CATEGORIES: Record<number, string> = {
  1: 'Animals',
  2: 'Buildings and Architecture',
  3: 'Business',
  4: 'Drinks',
  5: 'The Environment',
  6: 'States of Mind',
  7: 'Food',
  8: 'Graphic Resources',
  9: 'Hobbies and Leisure',
  10: 'Industry',
  11: 'Landscapes',
  12: 'Lifestyle',
  13: 'People',
  14: 'Plants and Flowers',
  15: 'Culture and Religion',
  16: 'Science',
  17: 'Social Issues',
  18: 'Sports',
  19: 'Technology',
  20: 'Transport',
  21: 'Travel',
};

export const ADOBE_CATEGORY_DEFAULT = 8; // Graphic Resources

export function getAdobeCategoryName(categoryId?: number): string {
  if (!categoryId) return 'Graphic Resources (#8)';
  const name = ADOBE_CATEGORIES[categoryId];
  return name ? `${name} (#${categoryId})` : `#${categoryId}`;
}
