# Where You See Photo Analysis, Good/Bad Flags, and What It Returns

## Where do I see the analysis?

Photo analysis (OpenAI Vision) is shown in the **Photo Album** in two places:

1. **Claim detail → Photos tab**  
   Open a claim, then click the **Photos** tab. You’ll see a grid of photos.  
   - **On each card**: Hover to see **quality score (X/10)**. A badge in the top‑right shows **Analyzing** (blue), **Review** (orange = concerns), **Failed** (red), or nothing when **Analysis complete** (green).  
   - **Click a photo** to open the detail dialog. There you see:
     - **Analysis status**: Pending / Analyzing / Analysis complete / Analysis failed / Concerns identified  
     - **Quality**: Good / Fair / Poor (X/10)  
     - **Damage Detected** badge when applicable  
     - **Description** (what’s in the photo)  
     - **Damage types** (e.g. water damage, hail damage)  
     - **Materials** (e.g. drywall, shingles)  
     - **Quality issues** (e.g. blurry, poor lighting)  
     - **Suggestions** (how to improve the photo)  
     - **Metadata**: Lighting, Focus, Angle, Coverage  
     - If analysis **failed** or **flagged concerns**: an error/concerns message and a **Re-analyze** button  

2. **Photos page**  
   From the app nav, open the **Photos** page for the claim. The same **Photo Album** component is used, so you see the same cards and the same detail dialog when you click a photo.

**Where you do *not* see analysis (today):**

- On the **Movement execution** page (inspection step), the “Previously Captured” evidence uses **EvidenceGrid**, which only shows thumbnails and a simple image/audio preview. It does **not** show quality score, concerns, or analysis. To see analysis for photos taken in a step, go to **Claim → Photos** (or the Photos page) and open that photo.

---

## Where do I see flags of good or bad?

Good/bad is indicated in these ways:

| Where | What you see |
|-------|-------------------------------|
| **Photo card (grid)** | **Badge** top‑right: **Analyzing** (blue), **Review** (orange = concerns / “bad”), **Failed** (red), or no badge when **Analysis complete** (good). **Hover**: quality X/10. |
| **Photo card** | **Damage Detected** badge (red) when the model says damage is present. |
| **Photo detail dialog** | **Analysis:** status pill (Analysis complete = good, Analysis failed = bad, Concerns identified = review). **Quality: Good/Fair/Poor (X/10)**. **Damage Detected** badge. **Quality issues** and **Suggestions** (what’s wrong / how to improve). **Analysis Failed** or **Concerns Identified** box with the error/concerns text. **Re-analyze** when failed or concerns. |

So: **good** = “Analysis complete,” no concerns, quality 7–10; **bad / review** = “Concerns identified” or “Analysis failed,” or low quality score, plus the issues/concerns/error text in the dialog.

---

## What does the analysis return?

The server calls OpenAI Vision and stores a structured **PhotoAnalysis** object. Here is what it returns (and what is shown in the UI).

### 1. `quality`

- **score** (number 1–10)  
  - Shown as **X/10** and as **Good** (7–10), **Fair** (5–6), **Poor** (1–4).  
- **issues** (string[])  
  - Shown under **Quality issues** in the photo dialog.  
- **suggestions** (string[])  
  - Shown under **Suggestions** in the photo dialog.

### 2. `content`

- **description** (string)  
  - Brief description of what’s in the photo. Shown as **Description** in the dialog.  
- **damageDetected** (boolean)  
  - Shown as **Damage Detected** badge when true.  
- **damageTypes** (string[])  
  - e.g. "water damage", "hail damage". Shown as **Damage types** badges.  
- **damageLocations** (string[])  
  - e.g. "ceiling", "wall", "roof". Available in data; not all locations may be shown in the current UI.  
- **materials** (string[])  
  - e.g. "drywall", "shingles". Shown as **Materials** badges.  
- **recommendedLabel** (string)  
  - Suggested label for the photo. Stored; may be used for labeling/taxonomy.  
- **concerns** (string[])  
  - e.g. staging, authenticity, quality. When non‑empty, the photo is marked **Concerns identified** and the text is stored in **analysisError** and shown in the **Concerns Identified** / error box in the dialog.

### 3. `metadata`

- **lighting**: `"good"` \| `"fair"` \| `"poor"`  
- **focus**: `"sharp"` \| `"acceptable"` \| `"blurry"`  
- **angle**: `"optimal"` \| `"acceptable"` \| `"suboptimal"`  
- **coverage**: `"complete"` \| `"partial"` \| `"insufficient"`  

All four are shown in the photo dialog under **Lighting**, **Focus**, **Angle**, **Coverage**.

### Status and error

- **analysisStatus**: `"pending"` \| `"analyzing"` \| `"completed"` \| `"failed"` \| `"concerns"`  
  - **completed** = analysis succeeded with no concerns.  
  - **concerns** = analysis succeeded but flagged issues (quality, authenticity, etc.).  
  - **failed** = analysis request failed (e.g. API error).  
- **analysisError** (string | null)  
  - For **failed**: error message. For **concerns**: concatenated concern reasons. Shown in the red/orange box in the dialog and used for the **Review** / **Failed** badges on the card.

---

## Quick reference

- **See analysis**: Claim → **Photos** tab (or Photos page) → click a photo → use the detail dialog.  
- **See good/bad**: Card badge (Analyzing / Review / Failed / none) and hover (X/10); in the dialog: status, Quality, Damage Detected, Quality issues, Suggestions, and the error/concerns box.  
- **What it returns**: `quality` (score, issues, suggestions), `content` (description, damageDetected, damageTypes, damageLocations, materials, recommendedLabel, concerns), `metadata` (lighting, focus, angle, coverage), plus **analysisStatus** and **analysisError**.
