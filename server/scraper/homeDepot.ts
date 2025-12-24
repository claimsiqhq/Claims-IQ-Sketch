import { supabaseAdmin } from '../lib/supabaseAdmin';

interface ScrapedProduct {
  sku: string;
  name: string;
  price: number;
  unit: string;
  url: string;
  storeId?: string;
  inStock: boolean;
  scrapedAt: Date;
}

interface ProductMapping {
  search: string;
  filters: Record<string, string[]>;
  unit: string;
  convertFrom?: string;
}

const PRODUCT_MAPPINGS: Record<string, ProductMapping> = {
  'DRY-SHEET-12': {
    search: 'drywall 4x8 1/2',
    filters: { brand: ['USG', 'Gold Bond', 'National Gypsum'] },
    unit: 'EA'
  },
  'DRY-COMPOUND': {
    search: 'joint compound all purpose',
    filters: {},
    unit: 'GAL',
    convertFrom: 'bucket'
  },
  'PAINT-INT-GAL': {
    search: 'interior paint gallon',
    filters: { brand: ['Behr', 'PPG', 'Glidden'] },
    unit: 'GAL'
  },
  'CARPET-STD': {
    search: 'carpet per square foot',
    filters: {},
    unit: 'SF'
  },
  'LVP-STD': {
    search: 'luxury vinyl plank flooring',
    filters: {},
    unit: 'SF'
  },
  'TRIM-BASE-MDF': {
    search: 'mdf baseboard 3.25',
    filters: {},
    unit: 'LF'
  },
  'PLY-CDX-12': {
    search: 'cdx plywood 1/2 4x8',
    filters: {},
    unit: 'EA'
  }
};

const STORE_REGIONS: Record<string, string> = {
  'US-TX-DAL': '581',
  'US-CA-SF': '678',
  'US-FL-MIA': '1903',
};

const BASE_URL = 'https://www.homedepot.com';

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePrice(text: string): number | null {
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', ''));
}

function parseUnit(text: string): string {
  if (text.includes('/sq. ft.') || text.includes('/SF')) return 'SF';
  if (text.includes('/linear ft.') || text.includes('/LF')) return 'LF';
  return 'EA';
}

interface ParsedProduct {
  name: string;
  price: number;
  unit: string;
  hdSku: string | null;
  url: string;
}

function parseSearchResults(html: string): ParsedProduct[] {
  const products: ParsedProduct[] = [];
  
  const productPodRegex = /<div[^>]*data-testid="product-pod"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let match;
  
  while ((match = productPodRegex.exec(html)) !== null && products.length < 10) {
    const podHtml = match[1];
    
    const priceMatch = podHtml.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (!priceMatch) continue;
    
    const price = parseFloat(priceMatch[1].replace(',', ''));
    
    const nameMatch = podHtml.match(/data-testid="product-header"[^>]*>([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
    
    const urlMatch = podHtml.match(/href="(\/p\/[^"]+)"/);
    const url = urlMatch ? BASE_URL + urlMatch[1] : '';
    
    const skuMatch = url.match(/\/(\d{9})(?:\?|$)/);
    const hdSku = skuMatch ? skuMatch[1] : null;
    
    const unitMatch = podHtml.match(/\/sq\. ft\.|\/piece|\/linear ft\./);
    const unit = unitMatch ? parseUnit(unitMatch[0]) : 'EA';
    
    products.push({ name, price, unit, hdSku, url });
  }
  
  return products;
}

// Fallback prices when scraper is blocked (based on typical Home Depot prices)
const FALLBACK_PRICES: Record<string, { name: string; price: number }> = {
  'DRY-SHEET-12': { name: 'Drywall Sheet 4x8 1/2"', price: 14.98 },
  'DRY-COMPOUND': { name: 'All Purpose Joint Compound 4.5 Gal', price: 16.97 },
  'PAINT-INT-GAL': { name: 'Interior Paint - Premium Quality', price: 38.98 },
  'CARPET-STD': { name: 'Standard Carpet', price: 1.89 },
  'LVP-STD': { name: 'Luxury Vinyl Plank Flooring', price: 2.79 },
  'TRIM-BASE-MDF': { name: 'MDF Baseboard Molding 3.25"', price: 1.09 },
  'PLY-CDX-12': { name: 'CDX Plywood 1/2" 4x8', price: 42.97 },
};

// Regional price adjustments (multipliers)
const REGIONAL_ADJUSTMENTS: Record<string, number> = {
  'US-TX-DAL': 1.0,    // Dallas - base prices
  'US-CA-SF': 1.18,    // San Francisco - 18% higher
  'US-FL-MIA': 1.08,   // Miami - 8% higher
};

async function searchProduct(searchTerm: string, storeId?: string): Promise<ParsedProduct[]> {
  const encodedSearch = encodeURIComponent(searchTerm);
  let url = `${BASE_URL}/s/${encodedSearch}?Ntt=${encodedSearch}&NCNI-5=true`;
  if (storeId) {
    url += `&storeId=${storeId}`;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      console.warn(`Search failed for '${searchTerm}': ${response.status} - Using fallback prices`);
      return [];
    }

    const html = await response.text();
    const results = parseSearchResults(html);

    // If no results parsed, the HTML structure may have changed
    if (results.length === 0) {
      console.warn(`No products parsed for '${searchTerm}' - HTML structure may have changed`);
    }

    return results;
  } catch (error) {
    console.error(`Error searching for '${searchTerm}':`, error);
    return [];
  }
}

async function scrapeAllMaterials(storeId?: string, regionId?: string): Promise<Map<string, ScrapedProduct>> {
  const results = new Map<string, ScrapedProduct>();
  let usedFallback = false;

  for (const [ourSku, mapping] of Object.entries(PRODUCT_MAPPINGS)) {
    console.log(`Scraping prices for ${ourSku}: '${mapping.search}'`);

    const searchResults = await searchProduct(mapping.search, storeId);

    if (searchResults.length > 0) {
      const prices = searchResults.filter(r => r.price > 0).map(r => r.price);
      if (prices.length > 0) {
        prices.sort((a, b) => a - b);
        const medianPrice = prices[Math.floor(prices.length / 2)];
        const bestResult = searchResults.reduce((best, current) =>
          Math.abs(current.price - medianPrice) < Math.abs(best.price - medianPrice) ? current : best
        );

        results.set(ourSku, {
          sku: ourSku,
          name: bestResult.name,
          price: bestResult.price,
          unit: mapping.unit,
          url: bestResult.url,
          storeId,
          inStock: true,
          scrapedAt: new Date()
        });
      }
    } else if (FALLBACK_PRICES[ourSku]) {
      // Use fallback prices when scraper is blocked or fails
      usedFallback = true;
      const fallback = FALLBACK_PRICES[ourSku];
      const adjustment = regionId ? (REGIONAL_ADJUSTMENTS[regionId] || 1.0) : 1.0;
      const adjustedPrice = Math.round(fallback.price * adjustment * 100) / 100;

      results.set(ourSku, {
        sku: ourSku,
        name: fallback.name,
        price: adjustedPrice,
        unit: mapping.unit,
        url: `${BASE_URL}/s/${encodeURIComponent(mapping.search)}`,
        storeId,
        inStock: true,
        scrapedAt: new Date()
      });
      console.log(`Using fallback price for ${ourSku}: $${adjustedPrice}`);
    }

    // Only delay if we're actually scraping (not using fallback)
    if (!usedFallback) {
      await delay(2000);
    } else {
      await delay(100); // Small delay for fallback
    }
  }

  if (usedFallback) {
    console.log('Note: Using fallback prices due to scraper access restrictions');
  }

  return results;
}

async function updateMaterialPrice(
  sku: string,
  regionId: string,
  price: number,
  source: string
): Promise<void> {
  const { data: material, error: materialError } = await supabaseAdmin
    .from('materials')
    .select('id')
    .eq('sku', sku)
    .single();

  if (materialError || !material) {
    console.warn(`Material ${sku} not found in catalog`);
    return;
  }

  const materialId = material.id;

  const { error: upsertError } = await supabaseAdmin
    .from('material_regional_prices')
    .upsert(
      {
        material_id: materialId,
        region_id: regionId,
        price,
        effective_date: new Date().toISOString().split('T')[0], // CURRENT_DATE equivalent
        source
      },
      { onConflict: 'material_id,region_id,effective_date' }
    );

  if (upsertError) {
    throw new Error(`Failed to upsert price for ${sku}: ${upsertError.message}`);
  }

  console.log(`Updated ${sku} in ${regionId}: $${price.toFixed(2)}`);
}

// Flag to track if the price_scrape_jobs table exists
let tableExists: boolean | null = null;

async function checkTableExists(): Promise<boolean> {
  if (tableExists !== null) return tableExists;

  const { error } = await supabaseAdmin
    .from('price_scrape_jobs')
    .select('id')
    .limit(1);

  // If we get a "relation does not exist" error, table doesn't exist
  if (error && (error.message.includes('does not exist') || error.code === '42P01')) {
    console.warn('[Scraper] price_scrape_jobs table does not exist. Run migration 018_price_scraper_and_sessions.sql');
    tableExists = false;
  } else {
    tableExists = true;
  }

  return tableExists;
}

async function createJobRecord(): Promise<string | null> {
  const exists = await checkTableExists();
  if (!exists) {
    // Return null to indicate we're running without job tracking
    console.log('[Scraper] Running without job tracking (table not found)');
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('price_scrape_jobs')
    .insert({
      source: 'home_depot',
      status: 'running',
      started_at: new Date().toISOString(),
      items_processed: 0,
      items_updated: 0,
      errors: []
    })
    .select('id')
    .single();

  if (error || !data) {
    console.warn(`[Scraper] Failed to create job record: ${error?.message}. Continuing without tracking.`);
    return null;
  }

  return data.id;
}

async function completeJob(
  jobId: string | null,
  status: string,
  itemsProcessed: number,
  itemsUpdated: number,
  error?: string
): Promise<void> {
  // Skip if we don't have a job ID (table doesn't exist)
  if (!jobId) return;

  const { error: updateError } = await supabaseAdmin
    .from('price_scrape_jobs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      items_processed: itemsProcessed,
      items_updated: itemsUpdated,
      errors: error ? [error] : []
    })
    .eq('id', jobId);

  if (updateError) {
    console.warn(`[Scraper] Failed to complete job ${jobId}: ${updateError.message}`);
  }
}

export async function runScrapeJob(): Promise<{
  jobId: string;
  status: string;
  itemsProcessed: number;
  itemsUpdated: number;
  usedFallback?: boolean;
  noTracking?: boolean;
}> {
  const jobId = await createJobRecord();
  let itemsProcessed = 0;
  let itemsUpdated = 0;
  let usedFallback = false;

  try {
    for (const [regionId, storeId] of Object.entries(STORE_REGIONS)) {
      console.log(`Scraping Home Depot for region ${regionId}`);

      const results = await scrapeAllMaterials(storeId, regionId);

      // Check if we got fallback prices
      if (results.size > 0) {
        const firstResult = Array.from(results.values())[0];
        if (firstResult.url.includes('/s/')) {
          usedFallback = true;
        }
      }

      for (const [sku, product] of Array.from(results.entries())) {
        itemsProcessed++;
        const source = usedFallback ? 'fallback_prices' : 'home_depot_scrape';
        await updateMaterialPrice(sku, regionId, product.price, source);
        itemsUpdated++;
      }
    }

    await completeJob(jobId, 'completed', itemsProcessed, itemsUpdated);
    return {
      jobId: jobId || 'no-tracking',
      status: 'completed',
      itemsProcessed,
      itemsUpdated,
      usedFallback,
      noTracking: !jobId
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await completeJob(jobId, 'failed', itemsProcessed, itemsUpdated, errorMessage);
    throw error;
  }
}

export async function testScrape(): Promise<Map<string, ScrapedProduct>> {
  console.log('\n=== Scraped Material Prices ===\n');
  const results = await scrapeAllMaterials(undefined, 'US-TX-DAL');

  for (const [sku, product] of Array.from(results.entries())) {
    console.log(`${sku}:`);
    console.log(`  Name: ${product.name}`);
    console.log(`  Price: $${product.price.toFixed(2)} / ${product.unit}`);
    console.log(`  URL: ${product.url}`);
    console.log();
  }

  return results;
}

export { PRODUCT_MAPPINGS, STORE_REGIONS };
