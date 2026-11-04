export interface CsvTemplateSpec {
  id: string;
  name: string;
  fileName: string;
  sampleUrl: string;
  headers: string[];
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
    fileName: 'adobe_stock_metadata.csv',
    sampleUrl: '/samples/adobe_stock_official_sample.csv',
    headers: ['Filename', 'Title', 'Keywords', 'Category', 'Releases'],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop and coffee cup in natural sunlight',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        '3',
        '',
      ],
      [
        'B01_NT_VC_002_geometric_pattern.eps',
        'Abstract seamless geometric vector background in monochrome tones',
        'vector, geometric, pattern, abstract, seamless, background, illustration, modern, design, texture',
        '11',
        '',
      ],
    ],
    maxTitleChars: 199,
    maxDescChars: 0,
    maxKeywords: 25,
    rules: [
      'Strictly 5 columns: Filename, Title, Keywords, Category, Releases.',
      'Title limit is 199 characters maximum (no Description column).',
      'Optimized strictly to 25 keywords for peak SEO ranking; prevents search algorithm dilution.',
      'Category uses official numeric IDs (1 to 21).',
      'EPS Vector Override: When exporting .jpg previews of vectors, filenames automatically switch to .eps.',
    ],
    rulesAr: [
      'يتكون من 5 أعمدة: Filename, Title, Keywords, Category, Releases.',
      'الحد الأقصى للعنوان 199 حرفاً (بدون عمود Description).',
      'الحد الأقصى 25 كلمة مفتاحية لتحقيق أعلى تصنيف SEO وتجنب تشتيت خوارزمية البحث.',
      'يُكتب التصنيف كرقم رسمي من 1 إلى 21.',
      'تحويل تلقائي لملفات EPS: يتم استبدال امتداد معاينة .jpg إلى .eps تلقائياً عند التصدير.',
    ],
    tips: [
      'Place core subject nouns within the first 10 keywords.',
      'Set the "Created using generative AI tools" checkbox in the Adobe portal when uploading AI batches.',
    ],
    tipsAr: [
      'ضع الكلمات المفتاحية الأساسية للموضوع ضمن أول 10 كلمات.',
      'فعّل خيار محتوى AI داخل بوابة Adobe Stock عند رفع دفعات الذكاء الاصطناعي.',
    ],
  },
  {
    id: 'shutterstock',
    name: 'Shutterstock',
    fileName: 'shutterstock_metadata.csv',
    sampleUrl: '/samples/shutterstock_official_sample.csv',
    headers: ['Filename', 'Description', 'Keywords', 'Categories', 'Editorial', 'Mature content', 'Illustration'],
    sampleRows: [
      [
        'B01_NT_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight.',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'Business/Finance,Technology',
        'no',
        'no',
        'no',
      ],
    ],
    maxTitleChars: 0,
    maxDescChars: 200,
    maxKeywords: 50,
    rules: [
      'Shutterstock uses the "Description" column as the main asset title (max 200 chars).',
      'Up to 2 official category names separated by a comma without spaces (e.g. "Nature,Backgrounds/Textures").',
      'Editorial, Mature content, and Illustration flags use lowercase "yes" or "no".',
      'Note: Shutterstock generally prohibits AI-generated submissions.',
    ],
    rulesAr: [
      'تعتمد المنصة عمود Description كعنوان رئيسي للملف (بحد أقصى 200 حرف).',
      'يُسمح بتصنيفين كحد أقصى مفصولين بفاصلة دون مسافات (مثال: Business/Finance,Technology).',
      'حقول Editorial و Mature content و Illustration تقبل القيم yes أو no.',
      'ملاحظة: تمنع Shutterstock عادةً رفع المحتوى المولد بالذكاء الاصطناعي.',
    ],
    tips: [
      'Avoid camera make/model names or lens specs in the Description.',
      'Vector EPS uploads automatically set Illustration to "yes".',
    ],
    tipsAr: [
      'تجنب ذكر طراز الكاميرا أو العدسة داخل الوصف.',
      'عند تصدير ملفات الفكتور EPS يتم ضبط حقل Illustration على yes تلقائياً.',
    ],
  },
  {
    id: 'freepik',
    name: 'Magnific',
    fileName: 'freepik_metadata.csv',
    sampleUrl: '/samples/freepik_official_sample.csv',
    headers: ['File name', 'Title', 'Keywords', 'Prompt', 'Model'],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop and coffee cup',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight',
        'Midjourney 6',
      ],
    ],
    maxTitleChars: 100,
    maxDescChars: 0,
    maxKeywords: 50,
    rules: [
      'Exact semicolon-delimited (;) CSV format required by Magnific (Freepik).',
      'Headers: "File name;Title;Keywords;Prompt;Model".',
      'Title must be between 5 and 100 characters.',
      'When AI flag is enabled, Prompt and Model columns are populated from the detailed description and selected model.',
    ],
    rulesAr: [
      'يُصدّر الملف بفاصل الفاصلة المنقوطة (;) المعتمد رسمياً لدى Magnific (Freepik).',
      'الأعمدة: File name;Title;Keywords;Prompt;Model.',
      'طول العنوان يجب أن يتراوح بين 5 و 100 حرف.',
      'عند تفعيل خيار AI يتم تعبئة عمودي Prompt و Model تلقائياً.',
    ],
    tips: [
      'Ensure the AI model name matches Magnific’s approved generator list.',
      'For standard photography/vectors, leave AI toggle off to export empty Prompt and Model columns.',
    ],
    tipsAr: [
      'تأكد من اختيار اسم نموذج AI متوافق مع قائمة Magnific المعتمدة.',
      'للملفات غير المولدة بالـ AI أوقف خيار AI لتصدير حقلي Prompt و Model فارغين.',
    ],
  },
  {
    id: 'vecteezy',
    name: 'Vecteezy',
    fileName: 'vecteezy_metadata.csv',
    sampleUrl: '/samples/vecteezy_official_sample.csv',
    headers: ['Filename', 'Title', 'Description', 'Keywords', 'License'],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop and coffee cup in sunlight',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight.',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'pro',
      ],
    ],
    maxTitleChars: 199,
    maxDescChars: 300,
    maxKeywords: 49,
    rules: [
      'Direct Web Upload Parity: 5 columns (Filename, Title, Description, Keywords, License).',
      'Filename includes the exact file extension (.jpg, .mp4, .eps).',
      'Title requires at least 3 words (max 199 chars) with smart punctuation sanitization.',
      'License accepts lowercase "pro" or "free".',
    ],
    rulesAr: [
      'متوافق مباشرة مع واجهة رفع Vecteezy عبر 5 أعمدة: Filename, Title, Description, Keywords, License.',
      'حقل Filename يتضمن الامتداد الكامل للملف (.jpg أو .mp4 أو .eps).',
      'يجب أن يحتوي العنوان على 3 كلمات على الأقل وبحد أقصى 199 حرفاً.',
      'حقل License يقبل القيمة pro أو free.',
    ],
    tips: [
      'Upload your media files in Vecteezy Contributor Manager, then attach this CSV directly.',
    ],
    tipsAr: [
      'ارفع الملفات أولاً في لوحة مساهمي Vecteezy ثم ارفع ملف الـ CSV مباشرة.',
    ],
  },
  {
    id: 'dreamstime',
    name: 'Dreamstime',
    fileName: 'dreamstime_ai_generated.csv / dreamstime_standard.csv',
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
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        'Minimalist modern desk setup with laptop',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight.',
        '112',
        '145',
        '212',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        '0',
        '1',
        '1',
        '0',
        '0',
        '0',
        '',
        '',
      ],
    ],
    maxTitleChars: 70,
    maxDescChars: 250,
    maxKeywords: 50,
    rules: [
      'Dual Split Export Engine: Automatically generates separate files for AI assets (dreamstime_ai_generated.csv) and standard assets (dreamstime_standard.csv).',
      '"Image Name" (Title) is strictly capped at 70 characters.',
      'Categories 1, 2, and 3 use official Dreamstime numeric IDs; Category 212 is automatically assigned for AI assets.',
      'Safe licensing defaults: W-EL=1, P-EL=1, Free=0, SR-EL=0.',
    ],
    rulesAr: [
      'نظام الفصل المزدوج: يصدر ملفين منفصلين تلقائياً لمحتوى AI (dreamstime_ai_generated.csv) والمحتوى العادي (dreamstime_standard.csv).',
      'عمود Image Name محدد بـ 70 حرفاً كحد أقصى.',
      'التصنيفات الثلاثة تُكتب كأرقام رسمية؛ ويُضاف تصنيف 212 تلقائياً لملفات الذكاء الاصطناعي.',
      'إعدادات التراخيص الآمنة افتراضياً: W-EL=1 و P-EL=1 و Free=0 و SR-EL=0.',
    ],
    tips: [
      'Keep "Free" and "SR-EL" disabled (0) unless you explicitly intend to give away rights.',
    ],
    tipsAr: [
      'أبقِ خياري Free و SR-EL بقيمة 0 لحماية عوائدك وحقوق الملكية.',
    ],
  },
  {
    id: '123rf',
    name: '123RF',
    fileName: '123rf_metadata.csv',
    sampleUrl: '/samples/123rf_official_sample.csv',
    headers: ['oldfilename', '123rf_filename', 'description', 'keywords', 'country'],
    sampleRows: [
      [
        'B01_AI_PH_001_workspace.jpg',
        '',
        'Minimalist modern desk setup with laptop and coffee cup bathed in warm natural sunlight.',
        'desk, laptop, office, workspace, modern, minimalist, coffee, work, technology, business',
        'US',
      ],
    ],
    maxTitleChars: 0,
    maxDescChars: 200,
    maxKeywords: 50,
    rules: [
      'Exact lowercase headers: oldfilename, 123rf_filename, description, keywords, country.',
      '"oldfilename" matches your uploaded file; "123rf_filename" must remain blank.',
      '"description" acts as both title and description (max 200 chars).',
      '"country" uses a 2-letter ISO code (e.g. US, EG, AE, SA).',
    ],
    rulesAr: [
      'عناوين الأعمدة بحروف صغيرة: oldfilename, 123rf_filename, description, keywords, country.',
      'حقل oldfilename يطابق اسم ملفك، بينما يظل 123rf_filename فارغاً.',
      'حقل description يعمل كعنوان ووصف معاً (بحد أقصى 200 حرف).',
      'حقل country يقبل رمز الدولة المكون من حرفين (مثل EG, SA, AE, US).',
    ],
    tips: [
      'Set your default ISO country code in the Studio Inspector before exporting.',
    ],
    tipsAr: [
      'حدد رمز الدولة الافتراضي من القائمة الجانبية في الاستوديو قبل التصدير.',
    ],
  },
];
