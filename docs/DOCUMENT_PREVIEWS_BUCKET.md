# document-previews Supabase Bucket

## Purpose

The **`document-previews`** bucket stores **page preview images (PNG)** for PDF documents. It is used by the **Document Viewer** in the app so that:

1. PDFs can be shown as one image per page without re-rendering on each view.
2. Preview generation runs once per document; subsequent views use cached PNGs from this bucket.

Original document files (PDFs, etc.) live in the **`documents`** bucket. Rendered previews live here.

## When Is It Populated?

The bucket is filled **on demand**, not at upload time:

1. A user opens a **Claim** → **Documents** and opens the **Document Viewer** for a document.
2. The viewer requests previews: `GET /api/documents/:id/previews`.
3. If `preview_status` is not `completed`, the client calls `POST /api/documents/:id/generate-previews`.
4. The server:
   - Downloads the PDF from the `documents` bucket.
   - Renders each page to PNG using **`pdftoppm`** (Poppler).
   - Uploads each PNG to `document-previews` at:  
     `{organizationId}/{documentId}/page-{n}.png`.
5. The viewer then gets signed URLs for those PNGs and displays them.

So the bucket stays **empty** until at least one user has opened a **PDF** document in the Document Viewer and preview generation has **succeeded**.

Non-PDF documents (e.g. images) do not use this bucket; they use the original file from `documents`.

## Requirements for Preview Generation to Work

- **Supabase**: `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or legacy keys) must be set.
- **Buckets**: `documents` and `document-previews` are created at server startup via `initializeStorageBucket()` in `server/services/documents.ts`.
- **Server**: **Poppler** must be installed so `pdftoppm` and `pdfinfo` are available:
  - Ubuntu/Debian: `apt install poppler-utils`
  - macOS: `brew install poppler`
  - Replit: often pre-installed; if not, add to your run/config.

If Poppler is missing, preview generation fails (often with a spawn error), and no files are uploaded to `document-previews`.

## How to Confirm It’s Working

1. **Create/use a claim** that has at least one **PDF** document.
2. Open the claim → **Documents** tab → open the **Document Viewer** for that PDF.
3. Wait for “Generating previews…” to finish (or retry if it fails).
4. You should see the PDF pages as images in the viewer.
5. In Supabase Dashboard → Storage → **document-previews**:
   - You should see a folder per document: `{organizationId}/{documentId}/` with `page-1.png`, `page-2.png`, etc.

If the bucket is still empty after opening a PDF in the viewer, check:

- Server logs for “Preview generation failed” or “Failed to upload page”.
- That `pdftoppm` and `pdfinfo` are on the PATH (`which pdftoppm`).
- That Supabase credentials are set and the bucket exists (it is created at startup; upload logic also retries once after ensuring buckets exist if you see “bucket not found” errors).

## Code References

- Bucket name: `server/lib/supabase.ts` → `PREVIEWS_BUCKET = 'document-previews'`.
- Init: `server/services/documents.ts` → `initializeStorageBucket()` (creates bucket if missing).
- Generate + upload: `server/services/documents.ts` → `generateDocumentPreviews()`.
- Serve URLs: `server/services/documents.ts` → `getDocumentPreviewUrls()`.
- API: `GET /api/documents/:id/previews`, `POST /api/documents/:id/generate-previews` in `server/routes.ts`.
- Purge: when a claim is purged, preview files for that claim’s documents are removed from this bucket in `server/services/claims.ts`.
