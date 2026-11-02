/**
 * Official Shutterstock Categories: Image (26) vs Video (19)
 */

export const SHUTTERSTOCK_IMAGE_CATEGORIES = [
  'Abstract',
  'Animals/Wildlife',
  'Arts',
  'Backgrounds/Textures',
  'Beauty/Fashion',
  'Buildings/Landmarks',
  'Business/Finance',
  'Celebrities',
  'Education',
  'Food and drink',
  'Healthcare/Medical',
  'Holidays',
  'Industrial',
  'Interiors',
  'Miscellaneous',
  'Nature',
  'Objects',
  'Parks/Outdoor',
  'People',
  'Religion',
  'Science',
  'Signs/Symbols',
  'Sports/Recreation',
  'Technology',
  'Transportation',
  'Vintage',
] as const;

export const SHUTTERSTOCK_VIDEO_CATEGORIES = new Set([
  'Animals/Wildlife',
  'Arts',
  'Backgrounds/Textures',
  'Buildings/Landmarks',
  'Business/Finance',
  'Education',
  'Food and drink',
  'Healthcare/Medical',
  'Holidays',
  'Industrial',
  'Nature',
  'Objects',
  'People',
  'Religion',
  'Science',
  'Signs/Symbols',
  'Sports/Recreation',
  'Technology',
  'Transportation',
]);

export const SHUTTERSTOCK_VIDEO_CATEGORY_LIST = Array.from(SHUTTERSTOCK_VIDEO_CATEGORIES);

/**
 * Image-only categories mapped to closest valid Video category
 */
export const SHUTTERSTOCK_IMAGE_TO_VIDEO_MAP: Record<string, string> = {
  abstract: 'Backgrounds/Textures',
  'beauty/fashion': 'People',
  interiors: 'Buildings/Landmarks',
  'parks/outdoor': 'Nature',
  vintage: 'Arts',
  celebrities: 'People',
  miscellaneous: 'Objects',
};

/**
 * Normalizes any category string into an official Shutterstock category.
 * If isVideo is true, strictly guarantees output is one of the 19 Video categories.
 */
export function normalizeShutterstockCategory(cat: string, isVideo = false): string | null {
  if (!cat || typeof cat !== 'string') return null;
  const trimmed = cat.trim();
  const lower = trimmed.toLowerCase();

  // Alias support
  if (lower === 'the arts' || lower === 'arts') {
    return 'Arts';
  }
  if (lower === 'food and drink' || lower === 'food & drink') {
    return 'Food and drink';
  }

  // Exact match search
  let match: string | null = null;
  for (const official of SHUTTERSTOCK_IMAGE_CATEGORIES) {
    if (official.toLowerCase() === lower) {
      match = official;
      break;
    }
  }

  // Substring match search
  if (!match) {
    for (const official of SHUTTERSTOCK_IMAGE_CATEGORIES) {
      if (official.toLowerCase().includes(lower) || lower.includes(official.toLowerCase())) {
        match = official;
        break;
      }
    }
  }

  // Video fallback conversion
  if (match && isVideo && !SHUTTERSTOCK_VIDEO_CATEGORIES.has(match)) {
    const fallback = SHUTTERSTOCK_IMAGE_TO_VIDEO_MAP[match.toLowerCase()];
    return fallback || 'Objects';
  }

  return match;
}

/**
 * Normalizes an array of categories into valid Shutterstock categories.
 */
export function normalizeShutterstockCategories(categories: (string | undefined)[], isVideo = false): string[] {
  const valid = categories
    .filter(Boolean)
    .map((c) => normalizeShutterstockCategory(c as string, isVideo))
    .filter(Boolean) as string[];

  return Array.from(new Set(valid));
}

/**
 * Formats multiple Shutterstock categories with a comma and NO space (e.g. "Nature,Science")
 */
export function formatShutterstockCategories(categories: (string | undefined)[], isVideo = false): string {
  const unique = normalizeShutterstockCategories(categories, isVideo).slice(0, 2);
  const defaultCat = isVideo ? 'Objects' : 'Miscellaneous';
  return unique.length > 0 ? unique.join(',') : defaultCat;
}
