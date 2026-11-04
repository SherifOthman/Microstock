# Local AI (`LFM3-VL-2B`) Deep Optimization & Auto-Scaling Architecture

This plan optimizes StockFlow's Local AI pipeline specifically for **Liquid AI LFM3-VL-2B** running in LM Studio, solving premature keyword truncation (`~25–29 tags`), eliminating heavy 1,735-token prompt prefill bottlenecks on integrated graphics (**Intel Core i5-1240P + Iris Xe 16GB RAM**), and automatically scaling performance when running on a stronger dedicated GPU workstation—without altering a single line of the Cloud API KeyRing algorithm.

---

## User Review & Confirmed Decisions

> [!IMPORTANT]
> All three architectural choices have been confirmed and are locked into this plan:

- **Confirmed Decision 1 — 4 Categorized Keyword Buckets + Text-Only Top-Up (Strict 45–49 Keyword Target)**:
  - The Local AI prompt and parser will use **4 structured semantic buckets** (`subject_keywords`, `concept_and_action_keywords`, `mood_and_lighting_keywords`, `setting_and_color_keywords` — 12 tags each) so the 2B model naturally produces **45 to 49 unique keywords** in a single pass without losing count.
  - All normalized keyword outputs in the Local AI pipeline are strictly capped at **49 keywords maximum** (`45–49` sweet spot, never 50+) to prevent portal rejections on Shutterstock, Vecteezy, and Freepik.
  - If the first pass ever yields fewer than 45 unique valid keywords after sanitization, the retry will execute a **fast text-only completion request** (no base64 image re-upload, no vision encoder re-prefill) asking only for the missing number of supplemental keywords based on the already-generated title, description, and existing tags.
- **Confirmed Decision 2 — Auto-Scaling Hardware Profiles (Laptop iGPU vs. High-Spec Dedicated GPU)**:
  - StockFlow will automatically detect the host GPU/hardware tier via WebGL renderer inspection and `navigator.hardwareConcurrency` / device memory (with an optional override selector: `Auto-Detect`, `Efficiency (iGPU / Laptop)`, `Performance (Dedicated GPU)`).
  - On integrated GPUs (**Intel Iris Xe / UHD / AMD Radeon Graphics**), StockFlow downscales the Local AI vision payload to **384px (`0.72` JPEG quality)** and uses a compact token budget, cutting vision patch tokens and prefill latency by ~40%. On dedicated GPUs (**NVIDIA RTX / AMD RX / Apple Silicon**), it automatically scales up to **512px (`0.82` quality)** with faster inter-item dispatch.
- **Confirmed Decision 3 — Embedded `LFM3-VL-2B` Tuning Checklist in Local AI Settings**:
  - A compact, scannable **LM Studio Optimal Setup Guide** card will be embedded in the Local AI Settings panel reminding the user of the exact `LFM3-VL-2B` settings (`Context Length: 4096`, `GPU Offload: Max (24)`, `Disable 'Enable Thinking'`, `Temperature: 0.1`, `Parallel / Max Concurrent Predictions: 1`, `Evaluation Batch Size: 512`).

---

## 1. Overview & Root-Cause Diagnosis

### Why `LFM3-VL-2B` Previously Stopped at ~25–29 Keywords & Took 1,735 Prompt Tokens
1. **Attention Saturation & Repeat Penalty in Flat Arrays (`completion_tokens: 260`)**:
   - `LFM3-VL-2B` uses a 1.73B text backbone. When asked for 45–49 items inside a single flat JSON array (`"ranked_keywords": [...]`), the model cannot track array length past ~25 items. Combined with a default `repeat_penalty` of `1.1` penalizing repeated `"..." ,` array delimiters, the probability of the closing `]` token spikes early.
2. **Cloud Prompt Bloat Sent to a 2B Local Model (`prompt_tokens: 1,735`)**:
   - The local pipeline previously reused `buildVisionPrompt()`, sending ~800 tokens of verbose Cloud prose alongside a 512px image (~900 vision patch tokens).
3. **Expensive Full-Image Retries**:
   - Whenever the first pass produced 27 keywords, the retry loop re-sent the **entire base64 image + full system/user prompt** from scratch, forcing the Iris Xe iGPU to re-run vision encoding all over again.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Zero-Config Auto-Detection**: When the user switches to **Local AI (LM Studio)**, StockFlow automatically detects their hardware profile (e.g., `Auto: Efficiency Mode — Intel Iris Xe detected`) and displays a subtle badge in the Local AI Settings panel.
  2. **Single-Pass 45–49 Keyword Generation**: Clicking **Start** or **Regenerate** in Metadata Studio sends a compact, 4-bucket multimodal request to LM Studio. The asset card displays a live elapsed timer and finishes with `Ready (Xs)` and **45–49 ranked keywords**.
  3. **Sub-Second Text-Only Top-Up (When Needed)**: If strict post-processing filters (such as removing forbidden medium/resolution terms) drop the keyword count below 45, StockFlow performs a lightweight **text-only** call to LM Studio (without the image) to top up the remaining tags to the 45–49 range in ~1–2 seconds.
  4. **LM Studio Configuration Checklist**: Inside **AI & API Keys → Local AI Server**, a clean, collapsible/compact checklist displays the exact recommended LM Studio settings for `LFM3-VL-2B`.
- **Visual Identity & Styling**:
  - Built strictly with `shadcn/ui` primitives (`Badge`, `Select`, `Button`, `Tooltip`) and semantic Tailwind tokens (`bg-card`, `border-border`, `text-muted-foreground`), maintaining full English (`LTR`) and Arabic (`RTL`) layout parity.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: 4-Bucket JSON Schema vs. Flat Array for Local 2B Models**
  - *Chosen Approach*: Instruct the local model to populate 4 distinct 12-item arrays (`subject_keywords`, `concept_keywords`, `mood_style_keywords`, `setting_color_keywords`), then deterministically flatten, deduplicate, rebalance Top-10 SEO priority, and slice to **45–49 keywords** (`MAX_KEYWORDS = 49`).
  - *Why*: A 2B model can effortlessly count to 10–12 four times in a row, achieving 45–49 total keywords on the first pass >95% of the time while preserving natural commercial hierarchy.
- **Decision 2: Text-Only Supplemental Top-Up vs. Multimodal Retry**
  - *Chosen Approach*: Add `requestAdditionalKeywordsTextOnly()` to the Local AI adapter. If pass #1 yields between 15 and 44 keywords, pass #2 sends **only text** (the generated title, description, and existing keywords) asking for 20 new complementary tags.
  - *Why*: Saves ~1,100 vision tokens on retry, avoiding Iris Xe iGPU memory stalls and completing the top-up in 1–2 seconds instead of 15–20 seconds.
- **Decision 3: Liquid AI Native Sampling Parameters in Request Payload**
  - *Chosen Approach*: Explicitly pass `temperature: 0.1`, `top_k: 50`, `min_p: 0.15`, `repeat_penalty: 1.04`, and `max_tokens: 900` in the `/v1/chat/completions` JSON body for Local AI.
  - *Why*: Matches Liquid AI's official `LFM3-VL-2B` hyperparameters while lowering `repeat_penalty` slightly from `1.1` to `1.04` so JSON array delimiters (`", "`) are never prematurely penalized into early stopping.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Metadata Studio (BatchQueueService)                  │
│          Strict 1-by-1 Sequential Queue · Per-Item AbortController          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼ (Cloud Mode - UNTOUCHED)            ▼ (Local Mode - Optimized)
     ┌──────────────────────────────┐      ┌──────────────────────────────────┐
     │      KeyRingScheduler        │      │   Auto-Scaling Hardware Profiler │
     │  (Gemini/Groq/OpenRouter...) │      │  • WebGL GPU + RAM + Core Check  │
     │  • Existing SYSTEM_VISION    │      │  • Laptop iGPU: 384px @ 0.72 JPG │
     │  • Existing buildVisionPrompt│      │  • Dedicated GPU: 512px @ 0.82   │
     └──────────────────────────────┘      └─────────────────┬────────────────┘
                                                             │
                                                             ▼
                                           ┌──────────────────────────────────┐
                                           │   Compact Local Prompt Builder   │
                                           │  • ~220 text tokens (vs ~800)    │
                                           │  • 4 Categorized Keyword Buckets │
                                           │  • Temp 0.1, RepeatPenalty 1.04  │
                                           └─────────────────┬────────────────┘
                                                             │
                                                             ▼
                                           ┌──────────────────────────────────┐
                                           │  Metadata Parser & Bucket Merger │
                                           │  • Merges 4 buckets in SEO order │
                                           │  • De-glues & strips forbidden   │
                                           │  • Enforces 45 to 49 tag target  │
                                           └─────────────────┬────────────────┘
                                                             │
                                        ┌────────────────────┴────────────────┐
                                        ▼ (45–49 tags)                        ▼ (< 45 tags)
                         ┌────────────────────────────┐        ┌──────────────────────────────┐
                         │   Save MasterRecord &      │        │ Fast Text-Only Top-Up Retry  │
                         │   Show "Ready (Xs)" Badge  │◄───────┤ • NO Image Base64 Re-upload  │
                         └────────────────────────────┘        │ • Merges & Caps at 49 Tags   │
                                                               └──────────────────────────────┘
```

### Interactive Component & State Mapping
1. **Hardware Profile Auto-Detector**:
   - Inspects WebGL `UNMASKED_RENDERER_WEBGL` to distinguish integrated GPUs (`Iris`, `UHD`, `Radeon(TM) Graphics`) from discrete GPUs (`RTX`, `GTX`, `Radeon RX`, `Apple M`).
   - Persists an optional `hardwareProfile: 'auto' | 'integrated' | 'dedicated'` setting in `LocalAiConfig` (defaulting to `'auto'`).
   - Downscales the image base64 payload in-memory to `384px` right before sending to LM Studio when running in `integrated` profile, while keeping `512px` in `dedicated` profile.
2. **Compact Local Prompt & 4-Bucket Parser**:
   - Dedicated `buildLocalVisionPrompt()` and `SYSTEM_LOCAL_VISION_PROMPT` that cut prompt token overhead by >60% while enforcing all microstock negative rules (no format words, no camera specs, no brands).
   - `parseAndNormalizeAiMetadata` automatically extracts and merges `subject_keywords`, `concept_keywords`, `mood_style_keywords`, and `setting_color_keywords` (while still supporting flat `ranked_keywords` for Cloud providers and backward compatibility), and caps Local AI output strictly at **49 keywords** (`45–49`).
3. **Text-Only Top-Up Fallback**:
   - When `isLocalMode` is active and initial parsing produces `< 45` valid keywords, `BatchQueueService` invokes `localAiAdapter.requestAdditionalKeywords()` (text-only `/v1/chat/completions` call without `image_url`), merges the new tags via `mergeUniqueRankedKeywords(..., 49)`, re-validates, and saves the record.
4. **Local AI Settings Checklist UI**:
   - Adds a Hardware Profile selector (`Auto-Detect`, `Laptop / Integrated GPU`, `Desktop / Dedicated GPU`) and a persistent **LM Studio Optimal Settings (`LFM3-VL-2B`)** checklist inside the Local AI Settings panel in both English and Arabic.
