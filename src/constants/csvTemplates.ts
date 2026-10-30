/**
 * Official Microstock CSV Templates, Header Specifications, and Real-World Ingestion Rules
 * Reverse-engineered from official contributor guidelines and active ingestion platforms.
 */

export interface StockPlatformSpec {
  id: 'adobe' | 'freepik' | 'shutterstock' | 'vecteezy' | 'dreamstime' | '123rf';
  name: string;
  delimiter: string;
  encoding: 'UTF-8' | 'UTF-8 with BOM';
  headers: string[];
  filenameRules: {
    requiresExtension: boolean;
    maxLength: number;
    disallowedCharacters: string;
    description: string;
  };
  sampleCsv: string;
  commonFailureReasons: string[];
  tipsForUpload: string[];
}

export const STOCK_PLATFORMS_SPEC: Record<string, StockPlatformSpec> = {
  vecteezy: {
    id: 'vecteezy',
    name: 'Vecteezy',
    delimiter: ',',
    encoding: 'UTF-8 with BOM',
    headers: ['Id', 'Filename', 'Title', 'Description', 'Keywords', 'License'],
    filenameRules: {
      requiresExtension: true, // For Web Add Data; optional for FTP
      maxLength: 100,
      disallowedCharacters: 'accents (ç, é, ñ), underscores (_), spaces, ellipses (…)',
      description:
        'Vecteezy website sanitizes filenames on upload: strips underscores, removes accents, and truncates long names with ellipses (…). Primary matching key is the "Id" column!',
    },
    sampleCsv: `"Id","Filename","Title","Description","Keywords","License"
"10293841","Acaibowlwithtoppings2K.jpg","Acai Bowl With Fresh Berries And Coconut Flakes","A colorful acai smoothie bowl topped with fresh strawberries blueberries and toasted coconut flakes on a wooden table.","acai, smoothie bowl, breakfast, superfood, berries, organic, healthy, vegan, fruit","pro"
"10293842","Zucchininoodlestossedwithpesto.jpg","Zucchini Noodles Tossed With Homemade Pesto Sauce","Fresh zucchini spiralized noodles tossed with rich basil pesto and cherry tomatoes in a white ceramic dish.","zucchini noodles, zoodles, pesto, vegan, healthy, pasta alternative, vegetarian, green","pro"`,
    commonFailureReasons: [
      'Leaving "Id" column empty when uploading to Vecteezy "Add Data" web portal.',
      'Mismatched filenames: Vecteezy stripped underscores (e.g. Açai_bowl -> Acaibowl), causing pre-upload CSV to fail match.',
      'Special characters or diacritics in filenames (e.g. ç, …) which Vecteezy renames.',
      'Title not in Title Case or ending with a period/ellipsis (strictly forbidden).',
      'Fewer than 5 or more than 50 keywords.',
    ],
    tipsForUpload: [
      'Best Workflow: Upload your images first on Vecteezy -> Click "CSV" at top of Add Data page -> Drop that CSV into our "Vecteezy Hydrator" tool -> Re-upload the populated CSV!',
      'Keep title under 100 characters in strict Title Case with no trailing dots.',
      'The top 5 keywords carry 80% of search ranking on Vecteezy.',
    ],
  },

  adobe: {
    id: 'adobe',
    name: 'Adobe Stock',
    delimiter: ',',
    encoding: 'UTF-8',
    headers: ['Filename', 'Title', 'Keywords', 'Category', 'Releases'],
    filenameRules: {
      requiresExtension: true,
      maxLength: 100,
      disallowedCharacters: 'spaces, commas, diacritics',
      description:
        'Adobe Stock expects the exact filename including extension (e.g. image.jpg, video.mov) matching the uploaded asset.',
    },
    sampleCsv: `"Filename","Title","Keywords","Category","Releases"
"AcaiBowl01.jpg","Acai bowl with fresh sliced berries and coconut flakes","acai, breakfast, organic, superfood, berries, bowl, healthy, strawberry, coconut, vegan",7,""
"Zucchini02.jpg","Zucchini noodles tossed with fresh basil pesto sauce","zucchini, noodles, pesto, healthy, pasta alternative, vegan, vegetarian, dinner",7,""`,
    commonFailureReasons: [
      'Missing the 5th "Releases" column or missing trailing comma — Adobe Stock requires all 5 columns.',
      'UTF-8 BOM prepended to CSV — corrupts "Filename" header match in Adobe Stock.',
      'Including AI-related terms (ai, generative, midjourney, prompt) in Title or Keywords.',
      'More than 49 keywords (Adobe accepts up to 49 maximum).',
      'Filename case mismatch with uploaded file (e.g. photo.JPG vs photo.jpg).',
    ],
    tipsForUpload: [
      'Adobe Stock officially accepts standard UTF-8 without BOM with exact 5 columns.',
      'The 5th column "Releases" can be left blank (ending with trailing comma).',
      'Order keywords by relevance; Adobe prioritizes the first 10 keywords heavily.',
      'Ensure AI tags are completely stripped before exporting.',
    ],
  },

  freepik: {
    id: 'freepik',
    name: 'Freepik',
    delimiter: ';', // MANDATORY SEMICOLON
    encoding: 'UTF-8 with BOM',
    headers: ['File name', 'Title', 'Keywords', 'Prompt', 'Model'],
    filenameRules: {
      requiresExtension: true,
      maxLength: 60,
      disallowedCharacters: 'spaces, special symbols (!, @, #, $, %)',
      description:
        'Requires exact extension matching. Vectors (.eps) and previews (.jpg) must share identical base names.',
    },
    sampleCsv: `"File name";"Title";"Keywords";"Prompt";"Model"
"acai_bowl_healthy_breakfast.jpg";"Acai bowl with fresh berries and coconut toppings";"acai, smoothie, breakfast, berries, fruit, healthy, superfood, vegan, fresh";"macro photo of delicious acai bowl with berries";"Midjourney v6"
"zucchini_pasta_pesto.jpg";"Zucchini pasta noodles with green basil pesto";"zucchini, noodles, pesto, vegan, healthy, pasta, vegetable, vegetarian";"gourmet zoodles with green pesto";"Midjourney v6"`,
    commonFailureReasons: [
      'Using comma (,) instead of semicolon (;) delimiter — causes entire CSV to be ignored or dumped into column 1.',
      'Writing "Filename" instead of official header "File name" (with a space).',
      'Spaces in image filenames.',
      'Fewer than 5 or more than 50 keywords.',
    ],
    tipsForUpload: [
      'Always verify that the CSV uses semicolon (;) delimiter.',
      'Populate "Prompt" and "Model" columns for AI-generated assets to satisfy Freepik AI policies.',
    ],
  },

  shutterstock: {
    id: 'shutterstock',
    name: 'Shutterstock',
    delimiter: ',',
    encoding: 'UTF-8 with BOM',
    headers: [
      'Filename',
      'Description',
      'Keywords',
      'Categories',
      'Illustration',
      'Mature Content',
      'Editorial',
    ],
    filenameRules: {
      requiresExtension: true,
      maxLength: 80,
      disallowedCharacters: 'commas, quotes, special characters',
      description: 'Must match uploaded file name exactly, case-sensitive.',
    },
    sampleCsv: `"Filename","Description","Keywords","Categories","Illustration","Mature Content","Editorial"
"acai_bowl_01.jpg","Delicious acai smoothie bowl served with fresh strawberries and chia seeds","acai, breakfast, superfood, strawberries, berries, healthy, organic, bowl","Food and Drink, Healthcare/Medical","No","No","No"
"zucchini_pesto_02.jpg","Plate of spiralized zucchini noodles tossed with fresh basil pesto sauce","zucchini, noodles, pesto, food, vegetarian, vegan, healthy, diet","Food and Drink","No","No","No"`,
    commonFailureReasons: [
      'Third-party AI content uploaded (Shutterstock strictly locks and bans external AI content).',
      'Using a "Title" column instead of "Description" (Shutterstock has no Title column).',
      'Description shorter than 5 characters or longer than 200 characters.',
      'Category names not matching Shutterstock’s exact 26 predefined category strings.',
    ],
    tipsForUpload: [
      'Upload image files to Shutterstock before uploading the CSV.',
      'Use 1 or 2 official Shutterstock category names separated by commas.',
    ],
  },

  dreamstime: {
    id: 'dreamstime',
    name: 'Dreamstime',
    delimiter: ',',
    encoding: 'UTF-8 with BOM',
    headers: [
      'Filename',
      'Image Name',
      'Description',
      'Category 1',
      'Category 2',
      'Category 3',
      'keywords',
      'Free',
      'W-EL',
      'P-EL',
      'SR-EL',
      'SR-Price',
      'Editorial',
      'MR doc Ids',
      'Pr Docs',
    ],
    filenameRules: {
      requiresExtension: true,
      maxLength: 80,
      disallowedCharacters: 'commas, quotes',
      description: 'Exact match with unfinished uploads queue.',
    },
    sampleCsv: `"Filename","Image Name","Description","Category 1","Category 2","Category 3","keywords","Free","W-EL","P-EL","SR-EL","SR-Price","Editorial","MR doc Ids","Pr Docs"
"acai_bowl_01.jpg","Acai Bowl With Fresh Berries","Fresh acai smoothie bowl topped with sliced strawberries and shredded coconut on a rustic wooden table, AI-generated image.","115","105","114","acai, smoothie, breakfast, berries, healthy, superfood, vegan, fruit","0","1","1","0","","0","",""
"zucchini_pesto_02.jpg","Zucchini Noodles With Pesto","Spiralized fresh zucchini noodles mixed with creamy basil pesto and cherry tomatoes in a white dish, AI-generated image.","115","105","114","zucchini, noodles, pesto, healthy, pasta alternative, vegetarian, green","0","1","1","0","","0","",""`,
    commonFailureReasons: [
      'Description is shorter than or equal to Image Name length (strictly rejected by Dreamstime backend).',
      'Description does not end with a period (.).',
      'Missing Category 3 = 114 for AI-generated images.',
      'Accidentally setting SR-EL = 1 (enables copyright buyout and gives away full ownership!).',
      'Writing "Keywords" or "Title" instead of exact headers "keywords" and "Image Name".',
    ],
    tipsForUpload: [
      'Always ensure Description length is greater than Image Name length.',
      'Always keep SR-EL set to 0 to prevent buyers from buying out your copyright exclusively.',
      'Category 3 must be 114 for all AI-generated content.',
    ],
  },

  '123rf': {
    id: '123rf',
    name: '123RF',
    delimiter: ',',
    encoding: 'UTF-8 with BOM',
    headers: ['oldfilename', '123rf_filename', 'description', 'keywords', 'country'],
    filenameRules: {
      requiresExtension: true,
      maxLength: 80,
      disallowedCharacters: 'spaces, commas, quotes',
      description:
        'Must match your exact uploaded file name. "123rf_filename" and "country" can be left blank.',
    },
    sampleCsv: `"oldfilename","123rf_filename","description","keywords","country"
"Acaibowlwithtoppings2K.jpg","","Vibrant purple acai smoothie bowl garnished with fresh blueberries and granola on wooden table.","acai, blueberry, granola, chia, bowl, breakfast, smoothie, berry, fruit, healthy, food, nutrition, superfood, vegan",""
"Zucchininoodlestossedwithpesto.jpg","","Fresh zucchini spiralized noodles tossed with green basil pesto sauce and cherry tomatoes.","zucchini, noodles, pesto, vegan, healthy, pasta alternative, vegetarian, green, diet, dinner",""`,
    commonFailureReasons: [
      'Missing the "oldfilename" column or misspelling it.',
      'Omitting the file extension in "oldfilename".',
      'Fewer than 7 or more than 50 keywords.',
      'Uploading CSV before media files are uploaded via FTP/web.',
    ],
    tipsForUpload: [
      'Always upload media files first via FTP or web before submitting the CSV.',
      'Keep 123rf_filename and country empty unless you specifically need country tagging.',
    ],
  },
};
