import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Film,
  Layers,
  Sparkles,
  VolumeX,
  Wand2,
  Zap,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface HomeHubViewProps {
  onNavigate: (tool: 'studio' | 'tracker' | 'cleaner' | 'muter' | 'eps') => void;
}

export const HomeHubView: React.FC<HomeHubViewProps> = ({ onNavigate }) => {
  const { t, language, isRtl } = useLanguage();
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  const tools = [
    {
      id: 'studio' as const,
      title: language === 'ar' ? 'استوديو الـ Metadata بالذكاء الاصطناعي' : 'AI Metadata Studio',
      subtitle: 'Microstock Vision Engine',
      badge: language === 'ar' ? 'تحليل بصري متقدم' : 'Vision AI Multi-Agency',
      badgeColor: 'border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/10',
      icon: Wand2,
      iconColor: 'text-sky-500 bg-sky-500/10 border-sky-500/20',
      description:
        language === 'ar'
          ? 'توليد عناوين وأوصاف وكلمات مفتاحية متوافقة 100% مع معايير الـ SEO لـ 6 منصات ستوك كبرى مع تصدير CSV متكامل وتفادي الحظر.'
          : 'Generate commercial titles, descriptions, and ranked 1-2 word keywords tailored to strict microstock guidelines across 6 global agencies.',
      highlights: [
        'Adobe, Freepik, Shutterstock, Vecteezy, Dreamstime, 123RF',
        'Top-10 SEO Subject Rebalancer & Zero-Hallucination Categories',
        '100% Client-side Offline Privacy (Dexie IndexedDB)',
      ],
      ctaText: language === 'ar' ? 'فتح استوديو الـ Metadata' : 'Open Metadata Studio',
    },
    {
      id: 'tracker' as const,
      title: language === 'ar' ? 'متتبع التوزيع عبر المنصات' : 'Stock Distribution Tracker',
      subtitle: 'Multi-Agency Submission Hub',
      badge: language === 'ar' ? 'إدارة الرفع' : 'Portfolio Tracking',
      badgeColor: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
      icon: Layers,
      iconColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      description:
        language === 'ar'
          ? 'تتبع حالة رفع وقبول مئات الملفات عبر وكالات الستوك المختلفة، مع مؤشرات الحصص الدفعية ومزامنة فورية مع الاستوديو.'
          : 'Track upload, pending review, approved, and rejected statuses across all 6 stock agencies with quota management and batch synchronization.',
      highlights: [
        'Real-time status indicators (Uploaded, Approved, Rejected)',
        'Monthly & Daily batch limit monitoring per agency',
        'Single-click sync with Metadata Studio records',
      ],
      ctaText: language === 'ar' ? 'فتح متتبع التوزيع' : 'Open Distribution Tracker',
    },
    {
      id: 'cleaner' as const,
      title: language === 'ar' ? 'منظف ومُسمّي الملفات الذكي' : 'Smart Batch File Cleaner & Renamer',
      subtitle: 'Agency-Safe Sequential Renamer',
      badge: language === 'ar' ? 'أداة جديدة' : 'New Standalone Tool',
      badgeColor: 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
      icon: Sparkles,
      iconColor: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
      description:
        language === 'ar'
          ? 'إزالة التواريخ ومخلفات برامج الذكاء الاصطناعي والكاميرا تلقائياً، مع تقليص الطول إلى ≤ 55 حرف وترقيم تسلسلي ذكي يمنع تضارب الترتيب.'
          : 'Strip timestamps, resolution tags (4K/2K), AI boilerplate, and format clean sequential filenames (<= 55 chars) with zero-padded prefixes.',
      highlights: [
        'Chronological pre-sorting by file creation date',
        'Smart 3-digit zero-padding (001_, 002_) & Auto-detect last number',
        'Direct subfolder export via File System API or instant ZIP',
      ],
      ctaText: language === 'ar' ? 'فتح منظف ومُسمّي الملفات' : 'Open File Cleaner',
    },
    {
      id: 'muter' as const,
      title: language === 'ar' ? 'حذف الصوت من الفيديوهات بدون إعادة ترميز' : 'Lossless Video Audio Remover',
      subtitle: 'Zero-Reencode Video Muter',
      badge: language === 'ar' ? 'فوري بدون فقدان جودة' : '0% Quality Loss',
      badgeColor: 'border-amber-500/30 text-amber-500 bg-amber-500/10',
      icon: VolumeX,
      iconColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      description:
        language === 'ar'
          ? 'إزالة المسارات الصوتية من مقاطع الفيديو التوليدية أو المصورة في أجزاء من الثانية دون إعادة ضغط أو فقدان جودة الإطارات أو الدقة.'
          : 'Strip unwanted background audio, speech, and mic noise from MP4 and MOV stock footage in milliseconds without re-encoding video frames.',
      highlights: [
        'Lossless ISOBMFF container stream stripping (under 1s per 50MB clip)',
        'Automatic audio track detection (🔊 Audio Detected vs 🔇 Silent)',
        'Optional automatic filename cleaning upon export',
      ],
      ctaText: language === 'ar' ? 'فتح أداة حذف الصوت' : 'Open Video Muter',
    },
    {
      id: 'eps' as const,
      title: language === 'ar' ? 'مستخرج ومعالج فكتور EPS 10 إلى JPG فائق الدقة' : 'EPS 10 to High-Res JPG Extractor',
      subtitle: 'Microstock Vector Rasterizer',
      badge: language === 'ar' ? 'محرك فكتور متقدم' : 'True Vector PostScript',
      badgeColor: 'border-rose-500/30 text-rose-500 bg-rose-500/10',
      icon: Layers,
      iconColor: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
      description:
        language === 'ar'
          ? 'استخراج صور JPG نقية بدقة 4MP أو 16MP من ملفات Illustrator EPS 10 مع خلفية بيضاء نقية وتوافق 100% مع شروط الوكالات دون الحاجة لفتح برامج التصميم.'
          : 'Convert Adobe Illustrator EPS 10 files into 4MP+ or 16MP ultra-high-resolution agency-ready JPEGs on pure white backgrounds without opening Adobe Illustrator.',
      highlights: [
        'PostScript BoundingBox & CMYK/RGB to sRGB conversion',
        'Agency 4MP+ (2500px) & Ultra 16MP (4000px) presets',
        'Direct ZIP download, Directory save, or 1-Click Send to Studio',
      ],
      ctaText: language === 'ar' ? 'فتح محول فكتور EPS' : 'Open EPS Converter',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-10 px-3 sm:px-4 space-y-8">
      {/* Hero Welcome Header */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <Badge variant="outline" className="px-3 py-1 text-xs gap-1.5 border-primary/30 bg-primary/5 text-foreground font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>{language === 'ar' ? 'منظومة عمل متكاملة لمساهمي الستوك 100% محلية' : '100% Client-Side Microstock Suite'}</span>
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {language === 'ar' ? 'أدوات مساعدة المساهمين في منصات الستوك' : 'Microstock Contributor Tool Suite'}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {language === 'ar'
            ? 'مجموعة أدوات مستقلة متخصصة لرفع جودة وأرشفة وتجهيز ملفات الصور والفيديوهات والـ Metadata وفق الشروط الصارمة لكبرى وكالات الستوك العالمية.'
            : 'A modular, privacy-first tool suite designed to automate metadata generation, stock portfolio tracking, filename sanitization, and video muting.'}
        </p>
      </div>

      {/* 4 Standalone Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {tools.map((tool) => {
          const Icon = tool.icon;

          return (
            <Card
              key={tool.id}
              className="border-border bg-card/80 hover:bg-card hover:border-primary/50 transition-all duration-200 shadow-xs hover:shadow-md flex flex-col justify-between group overflow-hidden"
            >
              <CardContent className="p-5 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3.5">
                  {/* Top Bar: Icon + Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-105 ${tool.iconColor}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-mono py-0.5 px-2 ${tool.badgeColor}`}>
                      {tool.badge}
                    </Badge>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h2 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      {tool.title}
                    </h2>
                    <p className="text-[11px] text-muted-foreground font-mono">{tool.subtitle}</p>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed">{tool.description}</p>

                  {/* Highlights Bullet List */}
                  <div className="pt-2 border-t border-border/50 space-y-1.5">
                    {tool.highlights.map((highlight, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{highlight}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Primary Launch Action Button */}
                <div className="pt-3">
                  <Button
                    onClick={() => onNavigate(tool.id)}
                    className="w-full justify-between gap-2 text-xs font-semibold cursor-pointer group-hover:shadow-xs transition"
                  >
                    <span>{tool.ctaText}</span>
                    <ArrowIcon className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
