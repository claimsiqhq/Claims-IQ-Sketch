/**
 * PDF Generator Service
 *
 * Converts HTML estimate reports to real PDF files using Puppeteer.
 * Falls back to returning HTML if Puppeteer is unavailable.
 */

import { generatePdfReport, type ReportOptions } from './reportGenerator';

// Lazy-load puppeteer to handle environments where it's not available
let puppeteer: typeof import('puppeteer') | null = null;

async function loadPuppeteer() {
  if (puppeteer) return puppeteer;

  try {
    puppeteer = await import('puppeteer');
    return puppeteer;
  } catch (error) {
    console.warn('Puppeteer not available. PDF generation will fall back to HTML.');
    return null;
  }
}

// ============================================
// PDF GENERATION
// ============================================

/**
 * Generate a PDF from an estimate
 *
 * @param estimateId - The ID of the estimate
 * @param options - Report generation options
 * @returns PDF buffer or null if generation failed
 */
export async function generateEstimatePdf(
  estimateId: string,
  options: Partial<ReportOptions> = {}
): Promise<Buffer> {
  // First, generate the HTML report
  const html = await generatePdfReport(estimateId, options);

  // Try to use Puppeteer for real PDF generation
  const pup = await loadPuppeteer();

  if (pup) {
    return await renderHtmlToPdf(html, pup);
  }

  // Fallback: return HTML as a buffer (client can use print-to-PDF)
  console.warn(`Puppeteer not available. Returning HTML for estimate ${estimateId}`);
  return Buffer.from(html, 'utf-8');
}

/**
 * Render HTML to PDF using Puppeteer
 */
async function renderHtmlToPdf(
  html: string,
  pup: typeof import('puppeteer')
): Promise<Buffer> {
  let browser = null;

  try {
    // Launch browser with appropriate settings for the environment
    browser = await pup.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--single-process',
      ],
    });

    const page = await browser.newPage();

    // Set content with print-friendly settings
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    // Generate PDF with professional settings
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size: 9px; width: 100%; text-align: right; padding-right: 0.5in; color: #888;">
          Claims IQ Estimate Report
        </div>
      `,
      footerTemplate: `
        <div style="font-size: 9px; width: 100%; text-align: center; color: #888;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Check if PDF generation is available
 */
export async function isPdfGenerationAvailable(): Promise<boolean> {
  const pup = await loadPuppeteer();
  return pup !== null;
}

/**
 * Get PDF generation capabilities
 */
export async function getPdfCapabilities(): Promise<{
  available: boolean;
  method: 'puppeteer' | 'html-fallback';
}> {
  const pup = await loadPuppeteer();

  return {
    available: pup !== null,
    method: pup ? 'puppeteer' : 'html-fallback',
  };
}
