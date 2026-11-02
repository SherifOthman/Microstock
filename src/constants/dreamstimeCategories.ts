/**
 * Official Dreamstime Category Mappings (182 categories)
 * Maps numerical ID to Category Path, plus reverse string resolver and domain guardrails.
 */

export const DREAMSTIME_CATEGORIES: Record<number, string> = {
  11: 'Nature -> Generic vegetation',
  12: 'Nature -> Plants and trees',
  14: 'Nature -> Details',
  15: 'Nature -> Mountains',
  16: 'Nature -> Lakes and rivers',
  17: 'Nature -> Deserts',
  18: 'Nature -> Forests',
  19: 'Nature -> Sea & Ocean',
  20: 'Nature -> Tropical',
  22: 'Nature -> Clouds and skies',
  23: 'Nature -> Sunsets & Sunrises',
  24: 'Nature -> Waterfalls',
  25: 'Nature -> Flowers & Gardens',
  26: 'Nature -> Seasons specific',
  27: 'Nature -> Fields & Meadows',
  28: 'Nature -> Food ingredients',
  30: 'Animals -> Pets',
  31: 'Animals -> Birds',
  32: 'Animals -> Mammals',
  33: 'Animals -> Farm',
  34: 'Animals -> Marine life',
  35: 'Animals -> Reptiles & Amphibians',
  36: 'Animals -> Insects',
  37: 'Animals -> Rodents',
  39: 'Abstract -> Blurs',
  40: 'Abstract -> Competition',
  41: 'Abstract -> Craftsmanship',
  42: 'Abstract -> Danger',
  43: 'Abstract -> Exploration',
  44: 'Abstract -> Help',
  45: 'Abstract -> Luxury',
  46: 'Abstract -> Peace',
  47: 'Abstract -> Power',
  48: 'Abstract -> Purity',
  49: 'Abstract -> Security',
  50: 'Abstract -> Sports',
  51: 'Abstract -> Stress',
  52: 'Abstract -> Success',
  53: 'Abstract -> Teamwork',
  54: 'Abstract -> Unique',
  56: 'Travel -> Africa',
  57: 'Travel -> Asia',
  58: 'Travel -> America',
  59: 'Travel -> Europe',
  60: 'Travel -> Australasian',
  61: 'Travel -> Destination scenics',
  62: 'Travel -> Cruise',
  63: 'Travel -> Cuisine',
  64: 'Travel -> Resorts',
  65: 'Travel -> Arts & Architecture',
  66: 'Travel -> Tropical',
  67: 'Travel -> Currencies',
  68: 'Travel -> Flags',
  70: 'Arts & Architecture -> Landmarks',
  71: 'Arts & Architecture -> Generic architecture',
  72: 'Arts & Architecture -> Outdoor',
  73: 'Arts & Architecture -> Indoor',
  75: 'Business -> People',
  76: 'Business -> Teams',
  77: 'Business -> Industries',
  78: 'Business -> Computers',
  79: 'Business -> Communications',
  80: 'Business -> Finance',
  81: 'Business -> Still-life',
  82: 'Business -> Transportation',
  83: 'Business -> Metaphors',
  84: 'Business -> Objects',
  85: 'Business -> Travel',
  87: 'Industries -> Banking',
  88: 'Industries -> Travel',
  89: 'Industries -> Architecture',
  90: 'Industries -> Construction',
  91: 'Industries -> Computers',
  92: 'Industries -> Healthcare & Medical',
  93: 'Industries -> Cargo & Shipping',
  94: 'Industries -> Communications',
  95: 'Industries -> Legal',
  96: 'Industries -> Insurance',
  97: 'Industries -> Power and energy',
  98: 'Industries -> Transportation',
  99: 'Industries -> Environment',
  100: 'Industries -> Manufacturing',
  101: 'Industries -> Agriculture',
  102: 'Industries -> Military',
  104: 'Technology -> Telecommunications',
  105: 'Technology -> Computers',
  106: 'Technology -> Connections',
  107: 'Technology -> Retro',
  109: 'IT & C -> Networking',
  110: 'IT & C -> Connectivity',
  111: 'IT & C -> Internet',
  112: 'Abstract -> Backgrounds',
  113: 'IT & C -> Equipment',
  115: 'People -> Couples',
  116: 'People -> Women',
  117: 'People -> Men',
  118: 'People -> Families',
  119: 'People -> Children',
  120: 'People -> Teens',
  121: 'People -> Seniors',
  122: 'People -> Diversity',
  123: 'People -> Active',
  124: 'Arts & Architecture -> Details',
  127: 'Industries -> Food & Beverages',
  128: 'Abstract -> Religion',
  129: 'Technology -> Electronics',
  130: 'Arts & Architecture -> Night scenes',
  131: 'Arts & Architecture -> Modern buildings',
  132: 'Arts & Architecture -> Historic buildings',
  134: 'Objects -> Toys',
  135: 'Objects -> Isolated',
  136: 'Industries -> Entertainment',
  137: 'Nature -> Fruits & Vegetables',
  138: 'Objects -> Home related',
  139: 'People -> Body parts',
  140: 'Objects -> Tools',
  141: 'Abstract -> Textures',
  142: 'Objects -> Clothing & Accessories',
  143: 'Nature -> Geologic and mineral',
  144: 'Objects -> Still life',
  145: 'Objects -> Other',
  146: 'Nature -> Landscapes',
  147: 'Objects -> Electronics',
  148: 'Technology -> Other',
  149: 'Abstract -> Love',
  150: 'Industries -> Education',
  151: 'Objects -> Music and sound',
  152: 'Objects -> Retro',
  153: 'Arts & Architecture -> Home',
  154: 'Arts & Architecture -> Work places',
  155: 'Abstract -> Seasonal & Holiday',
  156: 'Objects -> Sports',
  157: 'Industries -> Sports',
  158: 'Abstract -> Fun',
  159: 'People -> Expressions',
  160: 'People -> Workers',
  161: 'Industries -> Oil and gas',
  162: 'People -> Portraits',
  163: 'Illustrations & Clipart -> Illustrations',
  164: 'Abstract -> Colors',
  165: 'Abstract -> Planetarium',
  166: 'Illustrations & Clipart -> 3D & Computer generated',
  167: 'Illustrations & Clipart -> Hand drawn & Artistic',
  168: 'Animals -> Wildlife',
  171: 'Nature -> Water',
  173: 'People -> Nudes',
  174: 'Arts & Architecture -> Ruins & Ancient',
  175: 'People -> Cosmetic & Makeup',
  176: 'Travel -> Antarctica',
  178: 'Editorial -> Celebrities',
  179: 'Editorial -> Events',
  180: 'Editorial -> People',
  181: 'Editorial -> Politics',
  182: 'Editorial -> Sports',
  183: 'Editorial -> Weather & Environment',
  184: 'Editorial -> Landmarks',
  185: 'Editorial -> Commercial',
  186: 'Illustrations & Clipart -> Vector',
  187: 'Abstract -> Mobile',
  189: 'Holidays -> New Years',
  190: 'Holidays -> Christmas',
  191: 'Holidays -> Thanksgiving',
  192: 'Holidays -> Halloween',
  193: 'Holidays -> Easter',
  194: 'Holidays -> Valentines Day',
  195: 'Holidays -> Mothers Day',
  196: 'Holidays -> Fathers Day',
  198: 'Web Design Graphics -> Web Icons',
  199: 'Web Design Graphics -> Web Backgrounds & Textures',
  200: 'Web Design Graphics -> Buttons',
  201: 'Web Design Graphics -> Banners',
  202: 'Holidays -> Other',
  203: 'Holidays -> Diwali',
  204: 'Holidays -> Chinese New Year',
  205: 'Holidays -> Ramadan',
  206: 'Holidays -> Mardi Gras',
  207: 'Holidays -> Cinco de Mayo',
  208: 'Holidays -> Hanukkah',
  209: 'Technology -> Science',
  210: 'IT & C -> Artificial Intelligence',
  211: 'Abstract -> Aerial',
  212: 'Illustrations & Clipart -> AI generated',
};

export const DREAMSTIME_STRING_TO_ID: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const [idStr, name] of Object.entries(DREAMSTIME_CATEGORIES)) {
    const id = Number(idStr);
    const cleanFull = name.toLowerCase().trim();
    map[cleanFull] = id;
    map[cleanFull.replace(/\s*->\s*/g, '->')] = id;

    if (name.includes('->')) {
      const sub = name.split('->')[1].toLowerCase().trim();
      if (!map[sub]) {
        map[sub] = id;
      }
    }
  }
  return map;
})();

export function findDreamstimeCategoryId(val: unknown): number | undefined {
  if (typeof val === 'number') {
    if (DREAMSTIME_CATEGORIES[val]) return val;
    return undefined;
  }
  if (!val || typeof val !== 'string') return undefined;

  const raw = val.trim();
  if (/^\d+$/.test(raw)) {
    const num = Number(raw);
    if (DREAMSTIME_CATEGORIES[num]) return num;
  }

  const normalized = raw.toLowerCase().trim();
  if (DREAMSTIME_STRING_TO_ID[normalized]) {
    return DREAMSTIME_STRING_TO_ID[normalized];
  }

  const stripped = normalized.includes('->') ? normalized.split('->')[1].trim() : normalized;
  if (DREAMSTIME_STRING_TO_ID[stripped]) {
    return DREAMSTIME_STRING_TO_ID[stripped];
  }

  for (const [idStr, name] of Object.entries(DREAMSTIME_CATEGORIES)) {
    const lower = name.toLowerCase();
    if (lower === normalized || lower.endsWith(stripped) || lower.includes(normalized)) {
      return Number(idStr);
    }
  }

  return undefined;
}

export function getDreamstimeCategoryName(categoryId?: number, isAiGenerated?: boolean): string {
  if (!categoryId || categoryId === 0) return '';
  const raw = DREAMSTIME_CATEGORIES[categoryId];
  if (!raw) return `#${categoryId}`;
  const shortName = raw.includes('->') ? raw.split('->')[1].trim() : raw;
  return isAiGenerated ? `${shortName} (AI Generated)` : shortName;
}

/**
 * Deterministically maps Adobe Stock / Shutterstock categories & subject hint to official Dreamstime category IDs
 * with strict Domain Sanity (Bicycles/Vehicles NEVER map to Food & Beverages).
 */
export function mapToDreamstimeCategories(
  adobeCat?: number,
  shutterCats: (string | undefined)[] = [],
  isAiGenerated = false,
  subjectHint = ''
): { cat1: number; cat2: number; cat3: number } {
  let cat1 = 112; // Abstract -> Backgrounds default
  let cat2 = 141; // Abstract -> Textures default

  const combined = (
    shutterCats.filter(Boolean).map((s) => (s || '').toLowerCase()).join(' ') +
    ' ' +
    (subjectHint || '').toLowerCase()
  ).trim();

  const has = (term: string) => combined.includes(term);

  // Transportation / Bicycles / Vehicles ALWAYS prioritized before food to prevent hallucinations
  if (
    adobeCat === 20 ||
    has('transport') ||
    has('vehicle') ||
    has('bike') ||
    has('bicycle') ||
    has('cycling') ||
    has('cyclist') ||
    has('car') ||
    has('auto') ||
    has('automotive') ||
    has('exhaust') ||
    has('tailpipe') ||
    has('engine') ||
    has('motorcycle') ||
    has('train') ||
    has('airplane') ||
    has('aviation')
  ) {
    cat1 = 98; // Industries -> Transportation
    cat2 = (has('sport') || has('bike') || has('bicycle') || has('cycling') || has('cyclist'))
      ? 156 // Objects -> Sports
      : 82; // Business -> Transportation
  } else if (
    has('space') ||
    has('asteroid') ||
    has('planet') ||
    has('meteor') ||
    has('cosmos') ||
    has('universe') ||
    has('galaxy') ||
    has('astronomy') ||
    has('solar system') ||
    has('orbit')
  ) {
    cat1 = 165; // Abstract -> Planetarium
    cat2 = 209; // Technology -> Science
  } else if (adobeCat === 7 || has('food') || has('fruit') || has('vegetable') || has('meal') || has('dish') || has('dessert')) {
    cat1 = 137; // Nature -> Fruits & Vegetables
    cat2 = 127; // Industries -> Food & Beverages
  } else if (adobeCat === 4 || has('drink') || has('beverage') || has('cocktail') || has('coffee') || has('tea')) {
    cat1 = 127; // Industries -> Food & Beverages
    cat2 = 171; // Nature -> Water
  } else if (adobeCat === 1 || has('animal') || has('wildlife') || has('pet') || has('dog') || has('cat') || has('bird')) {
    cat1 = 168; // Animals -> Wildlife
    cat2 = 32;  // Animals -> Mammals
  } else if (adobeCat === 2 || has('building') || has('interior') || has('landmark') || has('architecture')) {
    cat1 = 71;  // Arts & Architecture -> Generic architecture
    cat2 = 73;  // Arts & Architecture -> Indoor
  } else if (adobeCat === 3 || has('business') || has('finance') || has('corporate') || has('office')) {
    cat1 = 75;  // Business -> People
    cat2 = 80;  // Business -> Finance
  } else if (adobeCat === 5 || has('nature') || has('park') || has('outdoor') || has('landscape')) {
    cat1 = 99;  // Industries -> Environment
    cat2 = 146; // Nature -> Landscapes
  } else if (adobeCat === 6) {
    cat1 = 46;  // Abstract -> Peace
    cat2 = 52;  // Abstract -> Success
  } else if (adobeCat === 16 || has('science') || has('medical') || has('healthcare') || has('health') || has('doctor')) {
    cat1 = 92;  // Industries -> Healthcare & Medical
    cat2 = 209; // Technology -> Science
  } else if (adobeCat === 8 || has('background') || has('texture') || has('abstract')) {
    cat1 = 163; // Illustrations & Clipart -> Illustrations
    cat2 = 112; // Abstract -> Backgrounds
  } else if (adobeCat === 9) {
    cat1 = 158; // Abstract -> Fun
    cat2 = 41;  // Abstract -> Craftsmanship
  } else if (adobeCat === 10 || has('industrial') || has('factory')) {
    cat1 = 100; // Industries -> Manufacturing
    cat2 = 90;  // Industries -> Construction
  } else if (adobeCat === 11) {
    cat1 = 146; // Nature -> Landscapes
    cat2 = 15;  // Nature -> Mountains
  } else if (adobeCat === 12 || has('beauty') || has('fashion')) {
    cat1 = 153; // Arts & Architecture -> Home
    cat2 = 175; // People -> Cosmetic & Makeup
  } else if (adobeCat === 13 || has('people') || has('person') || has('man') || has('woman')) {
    cat1 = 162; // People -> Portraits
    cat2 = 118; // People -> Families
  } else if (adobeCat === 14 || has('flower') || has('plant') || has('garden')) {
    cat1 = 25;  // Nature -> Flowers & Gardens
    cat2 = 12;  // Nature -> Plants and trees
  } else if (adobeCat === 15 || has('religion')) {
    cat1 = 128; // Abstract -> Religion
    cat2 = 65;  // Travel -> Arts & Architecture
  } else if (adobeCat === 17) {
    cat1 = 51;  // Abstract -> Stress
    cat2 = 44;  // Abstract -> Help
  } else if (adobeCat === 18 || has('sport') || has('fitness') || has('workout')) {
    cat1 = 50;  // Abstract -> Sports
    cat2 = 156; // Objects -> Sports
  } else if (adobeCat === 19 || has('technology') || has('computer') || has('ai')) {
    cat1 = 105; // Technology -> Computers
    cat2 = 129; // Technology -> Electronics
  } else if (adobeCat === 21 || has('travel') || has('tourism')) {
    cat1 = 61;  // Travel -> Destination scenics
    cat2 = 88;  // Industries -> Travel
  }

  const cat3 = isAiGenerated ? 212 : 0; // 212 is official Dreamstime "Illustrations & Clipart -> AI generated"
  return { cat1, cat2, cat3 };
}
