# Microstock - Professional Multi-Agency Metadata & Distribution Suite

An intelligent, local-first microstock metadata generator and batch distribution tracker built for commercial stock photographers, illustrators, and footage creators.

---

## ⚡ Key Capabilities

- **Single-Pass Universal Generation**: Generates titles, descriptions, categories, and 40–50 ranked SEO keywords that comply with multiple stock agencies simultaneously.
- **Agency Ingestion Parity**:
  - **Adobe Stock**: 1–21 numeric categories, 30-char clean filenames, AI buzzwords stripped.
  - **Vecteezy**: Pure UTF-8 without BOM, Title Case, clean web-uploader parity (no hydrator needed).
  - **Freepik**: Semicolon delimiters (`;`), hyphens replaced with spaces, strict 49-keyword ceiling to prevent 50+ overflow from `_ai_generated`, and reverse-engineered generative prompts.
  - **Dreamstime**: Category 114 for AI, Description length > Title length enforcement, and extended license toggles.
  - **Shutterstock**: Official 26 category strings, 200-char semantic descriptions.
  - **123RF**: Old-filename mapping and standard comma formatting.
- **Failover & Paced KeyRing**:
  - Google Gemini (#1 Primary) with automated failover to Groq, OpenRouter, and Mistral.
  - Sliding-window RPM pacing, 429 backoff handling, and latency tracking.
- **Multi-Media Support**:
  - Commercial Photos (JPG, PNG, WebP)
  - Stock Footage (MP4, MOV with duration and resolution extraction)
  - Vectors & Graphic Resources (EPS, AI, SVG)
- **100% Local-First & Private**:
  - Powered by Dexie IndexedDB in your browser. Original image files never leave your machine; only compressed visual payloads are sent to your chosen AI provider.
  - Dark & Light mode support.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 🌐 Supported AI Vision Providers
- **Google Gemini** (15 RPM / 1,500 RPD free tier per key)
- **Groq Cloud** (Ultra-fast LPU inference)
- **OpenRouter** (Aggregated multimodal models)
- **Mistral AI** (Multimodal Pixtral)
- **Cloudflare Workers AI** (Global edge inference)

---

## 📄 License
MIT License. Created by Sherif Othman.
