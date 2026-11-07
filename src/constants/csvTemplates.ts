export interface CsvTemplateSpec {
  id: string;
  name: string;
  fileName: string;
  delimiter: ',' | ';';
  sampleUrl: string;
  headers: string[];
  secondaryHeadersLabel?: string;
  secondaryHeadersLabelAr?: string;
  secondaryHeaders?: string[];
  sampleRows: string[][];
  maxTitleChars: number;
  maxDescChars: number;
  maxKeywords: number;
  rules: string[];
  rulesAr: string[];
  tips: string[];
  tipsAr: string[];
}

export const CSV_TEMPLATES: CsvTemplateSpec[] = [
  {
    id: 'adobe',
    name: 'Adobe Stock',
    fileName: '{batch}_adobe_stock.csv',
    delimiter: ',',
    sampleUrl: '/samples/adobe_stock_official_sample.csv',
    headers: ['Filename', 'Title', 'Keywords', 'Category', 'Releases'],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop and coffee cup in natural sunlight',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        '8',
        '',
      ],
      [
        'B01_VC_002_geometric_pattern.eps',
        'Abstract seamless geometric vector background in monochrome tones',
        'vector, geometric, pattern, abstract, seamless, background, illustration, modern, design, texture',
        '8',
        '',
      ],
    ],
    maxTitleChars: 200,
    maxDescChars: 0,
    maxKeywords: 49,
    rules: [
      'Strictly 5 columns: Filename, Title, Keywords, Category, Releases (CRLF \\r\\n line endings, UTF-8 without BOM).',
      'Consumes Long Title (up to 200 characters) with smart word-boundary truncation and automatic stripping of forbidden AI terms.',
      'Capped at top 49 ranked keywords (supports strong 2-word compound phrases alongside single-word subjects).',
      'Category uses official numeric IDs (1 to 21; defaults to 8 Graphic Resources for vectors).',
      'Vector Filename Override: Vector previews (.jpg/.eps/.ai) automatically export with .eps extension; photo/video filenames are preserved byte-for-byte.',
    ],
    rulesAr: [
      'يتكون من 5 أعمدة: Filename, Title, Keywords, Category, Releases (بفواصل أسطر CRLF وترميز UTF-8 بدون BOM).',
      'يستخدم العنوان المفصل (Long Title) بحد أقصى 200 حرف مع قص ذكي عند حدود الكلمات وحذف تلقائي لمصطلحات AI المحظورة.',
      'محدد بـ 49 كلمة مفتاحية مرتبة حسب الأولوية مع دعم العبارات المكونة من كلمتين.',
      'يُكتب التصنيف كرقم رسمي من 1 إلى 21 (الافتراضي 8 للمتجهات).',
      'معالجة ملفات الفكتور: يتم تحويل امتداد معاينات المتجهات تلقائياً إلى .eps بينما تُحفظ أسماء الصور والفيديوهات كما هي.',
    ],
    tips: [
      'Place core subject nouns within the first 10 keywords.',
      'Enable the "Created using generative AI tools" checkbox in the Adobe Contributor portal when uploading AI batches.',
    ],
    tipsAr: [
      'ضع الكلمات المفتاحية الأساسية للموضوع ضمن أول 10 كلمات.',
      'فعّل خيار محتوى AI داخل بوابة Adobe Stock عند رفع دفعات الذكاء الاصطناعي.',
    ],
  },
  {
    id: 'shutterstock',
    name: 'Shutterstock',
    fileName: '{batch}_shutterstock.csv',
    delimiter: ',',
    sampleUrl: '/samples/shutterstock_official_sample.csv',
    headers: ['Filename', 'Description', 'Keywords', 'Categories', 'Editorial', 'Mature content', 'illustration'],
    sampleRows: [
      [
        'B01_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight.',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'Business/Finance,Technology',
        'no',
        'no',
        'no',
      ],
      [
        'B01_VC_002_geometric_pattern.eps',
        'Abstract seamless geometric vector background in monochrome tones.',
        'vector, geometric, pattern, abstract, seamless, background, illustration, modern, design, texture',
        'Abstract,Backgrounds/Textures',
        'no',
        'no',
        'yes',
      ],
    ],
    maxTitleChars: 0,
    maxDescChars: 200,
    maxKeywords: 50,
    rules: [
      'Official 7-column schema: Filename, Description, Keywords, Categories, Editorial, Mature content, illustration.',
      'Description consumes Long Title (smartly truncated at 200 chars and guaranteed to end with a period).',
      'Categories are normalized against Shutterstock’s official lists (26 Image categories vs 19 Video categories, up to 2 comma-separated).',
      'Vector Override: Vector files automatically export with .eps extension and set illustration="yes".',
    ],
    rulesAr: [
      'يتكون من 7 أعمدة رسمية: Filename, Description, Keywords, Categories, Editorial, Mature content, illustration.',
      'يستخدم عمود Description العنوان المفصل (Long Title) بحد أقصى 200 حرف مع ضمان انتهائه بنقطة.',
      'تُطابق التصنيفات تلقائياً مع قوائم Shutterstock الرسمية (26 تصنيفاً للصور و19 للفيديو، بحد أقصى تصنيفين).',
      'معالجة الفكتور: تُصدّر المتجهات بامتداد .eps مع ضبط حقل illustration على yes تلقائياً.',
    ],
    tips: [
      'Avoid camera make/model names or lens specs in the Description.',
      'Shutterstock prohibits generative AI submissions; keep AI batches isolated in B01_AI folders.',
    ],
    tipsAr: [
      'تجنب ذكر طراز الكاميرا أو العدسة داخل الوصف.',
      'تمنع Shutterstock رفع محتوى الذكاء الاصطناعي؛ لذا افصل دفعات AI في مجلدات مستقلة.',
    ],
  },
  {
    id: 'freepik',
    name: 'Magnific (Freepik)',
    fileName: '{batch}_magnific.csv',
    delimiter: ';',
    sampleUrl: '/samples/freepik_official_sample.csv',
    headers: ['File name', 'Title', 'Keywords', 'Prompt', 'Model'],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop and coffee cup',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight',
        'Google Nano Banana',
      ],
      [
        'B01_VC_002_geometric_pattern.jpg',
        'Abstract seamless geometric vector background in monochrome tones',
        'vector, geometric, pattern, abstract, seamless, background, illustration, modern, design, texture',
        '',
        '',
      ],
    ],
    maxTitleChars: 100,
    maxDescChars: 0,
    maxKeywords: 49,
    rules: [
      'Semicolon-delimited (;) CSV format: File name;Title;Keywords;Prompt;Model.',
      'Media Guardrail: Supports Photos & Vectors only — video files (.mp4, .mov) are automatically excluded during export.',
      'Consumes Short Title (strictly under 100 chars) with hyphens replaced by spaces to prevent Freepik word concatenation.',
      'Single-Word Keyword Splitter: Compound phrases (e.g. "home office" -> "home", "office") are automatically split into single words, deduplicated, and capped at 49 tags.',
      'Vector Preview Rule: Vector filenames automatically export with .jpg extension to match companion JPEG previews.',
    ],
    rulesAr: [
      'ملف CSV مفصول بفاصلة منقوطة (;): File name;Title;Keywords;Prompt;Model.',
      'حماية الوسائط: يدعم الصور والمتجهات فقط — يتم استبعاد ملفات الفيديو (.mp4, .mov) تلقائياً عند التصدير.',
      'يستخدم العنوان القصير (Short Title) بحد أقصى 100 حرف مع استبدال الشرطات (-) بمسافات لمنع دمج الكلمات.',
      'تقسيم الكلمات المركبة: يتم فصل العبارات المركبة تلقائياً إلى كلمات مفردة مع إزالة التكرار بحد أقصى 49 كلمة مفتاحية.',
      'قاعدة المتجهات: تُصدّر أسماء ملفات الفكتور بامتداد .jpg لمطابقة صورة المعاينة المرفقة.',
    ],
    tips: [
      'When AI flag is active, Prompt and Model columns are populated automatically; for Real assets they remain empty.',
    ],
    tipsAr: [
      'عند تفعيل وسم AI يتم تعبئة عمودي Prompt و Model تلقائياً، وتُترك فارغة للملفات الأصلية (Real).',
    ],
  },
  {
    id: 'vecteezy',
    name: 'Vecteezy',
    fileName: '{batch}_vecteezy.csv',
    delimiter: ',',
    sampleUrl: '/samples/vecteezy_official_sample.csv',
    headers: ['Filename', 'Title', 'Description', 'Keywords', 'License'],
    sampleRows: [
      [
        'B01AIPH001workspace.jpg',
        'Minimalist Modern Desk Setup with Laptop and Coffee Cup in Sunlight',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight.',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'pro',
      ],
      [
        'B01VC002geometricpattern',
        'Abstract Seamless Geometric Vector Background in Monochrome Tones',
        'Abstract seamless geometric vector background in monochrome tones for commercial design.',
        'vector, geometric, pattern, abstract, seamless, background, illustration, modern, design, texture',
        'pro',
      ],
    ],
    maxTitleChars: 100,
    maxDescChars: 300,
    maxKeywords: 45,
    rules: [
      '5-column schema: Filename, Title, Description, Keywords, License ("pro" or "free").',
      'Web Uploader Filename Parity: Strips spaces and underscores (_) while keeping hyphens (-) to match Vecteezy web ingestion.',
      'Vector Extension Rule: Vector filenames have their extension (.eps) stripped completely.',
      'Consumes Short Title (<100 chars), converted to Title Case and stripped of special symbols/trailing punctuation.',
      'Keywords are sanitized (no numeric-only tags) and capped at 45 priority keywords.',
    ],
    rulesAr: [
      'يتكون من 5 أعمدة: Filename, Title, Description, Keywords, License (بقيمة pro أو free).',
      'توافق رافع الويب: يتم إزالة المسافات والشرطات السفلية (_) من اسم الملف مع الإبقاء على الشرطات العادية (-).',
      'قاعدة المتجهات: يتم إزالة الامتداد (.eps) نهائياً من أسماء ملفات الفكتور كما تتطلب المنصة.',
      'يستخدم العنوان القصير (Short Title) ويُحوله تلقائياً إلى Title Case بحد أقصى 100 حرف.',
      'تُصفى الكلمات المفتاحية وتُحدد بـ 45 كلمة مفتاحية كحد أقصى.',
    ],
    tips: [
      'Upload your media files in Vecteezy Contributor Manager first, then attach this CSV directly.',
    ],
    tipsAr: [
      'ارفع الملفات أولاً في لوحة مساهمي Vecteezy ثم ارفق ملف الـ CSV مباشرة.',
    ],
  },
  {
    id: 'dreamstime',
    name: 'Dreamstime',
    fileName: '{batch}_dreamstime_images.csv / {batch}_dreamstime_videos.csv',
    delimiter: ',',
    sampleUrl: '/samples/dreamstime_official_sample.csv',
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
    secondaryHeadersLabel: 'Videos Schema (13 Columns — {batch}_dreamstime_videos.csv)',
    secondaryHeadersLabelAr: 'هيكل أعمدة الفيديو (13 عموداً — {batch}_dreamstime_videos.csv)',
    secondaryHeaders: [
      'Filename',
      'Video Name',
      'Description',
      'Category 1',
      'Category 2',
      'Category 3',
      'keywords',
      'W-EL',
      'SR-EL',
      'SR-Price',
      'Editorial',
      'MR doc Ids',
      'Pr Docs',
    ],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight, AI-generated image.',
        '112',
        '145',
        '212',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        '0',
        '1',
        '1',
        '0',
        '',
        '0',
        '',
        '',
      ],
    ],
    maxTitleChars: 200,
    maxDescChars: 756,
    maxKeywords: 50,
    rules: [
      'Media Split Export Engine: Automatically exports {batch}_dreamstime_images.csv (15 columns with Image Name, Free, P-EL) for Photos/Vectors and {batch}_dreamstime_videos.csv (13 columns with Video Name, no Free/P-EL) for Videos.',
      'Consumes Long Title (up to 200 chars) for Image/Video Name, while Description (up to 756 chars) is strictly enforced to be longer than the title and ends with a period.',
      'AI Disclosure & Category: AI assets automatically append ", AI-generated image." / ", AI-generated video." to Description and assign Category 3 = 212.',
      'Vector Preview Rule: Vector filenames automatically export with .jpg extension; safe license defaults set W-EL=1, P-EL=1, Free=0, SR-EL=0.',
    ],
    rulesAr: [
      'محرك الفصل التلقائي للوسائط: يصدر ملف {batch}_dreamstime_images.csv (15 عموداً للصور والمتجهات) وملف {batch}_dreamstime_videos.csv (13 عموداً للفيديوهات باسم Video Name وبدون عمودي Free و P-EL).',
      'يستخدم العنوان المفصل (Long Title) لعمود Image/Video Name (حتى 200 حرف)، مع ضمان أن يكون الوصف أطول دائماً ومنتهياً بنقطة.',
      'توثيق وتصنيف AI: يُضاف تلقائياً ", AI-generated image." أو ", AI-generated video." للوصف مع تعيين Category 3 = 212.',
      'قاعدة المتجهات والتراخيص: تُصدّر المتجهات بامتداد .jpg مع إعدادات ترخيص آمنة (W-EL=1, P-EL=1, Free=0, SR-EL=0).',
    ],
    tips: [
      'Keep "Free" and "SR-EL" (Sell the Rights) at 0 to protect your copyright and royalties.',
    ],
    tipsAr: [
      'أبقِ خياري Free و SR-EL بقيمة 0 لحماية حقوق الملكية وعوائدك المالية.',
    ],
  },
  {
    id: '123rf',
    name: '123RF',
    fileName: '{batch}_123rf.csv',
    delimiter: ',',
    sampleUrl: '/samples/123rf_official_sample.csv',
    headers: ['oldfilename', '123rf_filename', 'description', 'keywords', 'country'],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        '',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight.',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'EG',
      ],
    ],
    maxTitleChars: 0,
    maxDescChars: 300,
    maxKeywords: 50,
    rules: [
      'Exact lowercase 5-column schema: oldfilename, 123rf_filename, description, keywords, country.',
      '"oldfilename" matches your uploaded file (vectors automatically use .jpg companion extension); "123rf_filename" remains blank.',
      '"description" consumes Long Title (smartly truncated at 300 chars with a trailing period).',
      '"country" defaults to "EG" (configurable 2-letter ISO country code or blank).',
    ],
    rulesAr: [
      'عناوين الأعمدة بحروف صغيرة: oldfilename, 123rf_filename, description, keywords, country.',
      'حقل oldfilename يطابق اسم ملفك (تُحول المتجهات تلقائياً إلى امتداد المعاينة .jpg)، ويظل 123rf_filename فارغاً.',
      'يستخدم حقل description العنوان المفصل (Long Title) بحد أقصى 300 حرف منتهٍ بنقطة.',
      'حقل country يُضبط افتراضياً على EG (قابل للتخصيص برمز دولة من حرفين أو تركه فارغاً).',
    ],
    tips: [
      'Upload companion .jpg previews alongside .eps vectors so 123RF matches oldfilename cleanly.',
    ],
    tipsAr: [
      'ارفع صور المعاينة .jpg مع ملفات .eps ليتم ربطها تلقائياً عبر حقل oldfilename.',
    ],
  },
];

