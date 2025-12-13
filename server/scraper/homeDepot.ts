import { pool } from '../db';

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

async function searchProduct(searchTerm: string, storeId?: string): Promise<ParsedProduct[]> {
  const encodedSearch = encodeURIComponent(searchTerm);
  let url = `${BASE_URL}/s/${encodedSearch}?Ntt=${encodedSearch}&NCNI-5=true`;
  if (storeId) {
    url += `&storeId=${storeId}`;
  }
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      console.warn(`Search failed for '${searchTerm}': ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    return parseSearchResults(html);
  } catch (error) {
    console.error(`Error searching for '${searchTerm}':`, error);
    return [];
  }
}

async function scrapeAllMaterials(storeId?: string): Promise<Map<string, ScrapedProduct>> {
  const results = new Map<string, ScrapedProduct>();
  
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
    }
    
    await delay(2000);
  }
  
  return results;
}

async function updateMaterialPrice(
  sku: string,
  regionId: string,
  price: number,
  source: string
): Promise<void> {
  const client = await pool.connect();
  try {
    const materialResult = await client.query(
      'SELECT id FROM materials WHERE sku = $1',
      [sku]
    );
    
    if (materialResult.rows.length === 0) {
      console.warn(`Material ${sku} not found in catalog`);
      return;
    }
    
    const materialId = materialResult.rows[0].id;
    
    await client.query(`
      INSERT INTO material_regional_prices 
        (id, material_id, region_id, price, effective_date, source)
      VALUES (gen_random_uuid(), $1, $2, $3, CURRENT_DATE, $4)
      ON CONFLICT (material_id, region_id, effective_date) 
      DO UPDATE SET price = $3, source = $4
    `, [materialId, regionId, price, source]);
    
    console.log(`Updated ${sku} in ${regionId}: $${price.toFixed(2)}`);
  } finally {
    client.release();
  }
}

async function createJobRecord(): Promise<string> {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      INSERT INTO price_scrape_jobs (id, source, status, started_at, items_processed, items_updated, errors)
      VALUES (gen_random_uuid(), 'home_depot', 'running', NOW(), 0, 0, '[]'::jsonb)
      RETURNING id
    `);
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

async function completeJob(
  jobId: string, 
  status: string, 
  itemsProcessed: number,
  itemsUpdated: number,
  error?: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      UPDATE price_scrape_jobs 
      SET status = $2, completed_at = NOW(), 
          items_processed = $3, items_updated = $4,
          errors = CASE WHEN $5 IS NOT NULL 
                   THEN jsonb_build_array($5) 
                   ELSE '[]'::jsonb END
      WHERE id = $1
    `, [jobId, status, itemsProcessed, itemsUpdated, error || null]);
  } finally {
    client.release();
  }
}

export async function runScrapeJob(): Promise<{ 
  jobId: string; 
  status: string; 
  itemsProcessed: number;
  itemsUpdated: number;
}> {
  const jobId = await createJobRecord();
  let itemsProcessed = 0;
  let itemsUpdated = 0;
  
  try {
    for (const [regionId, storeId] of Object.entries(STORE_REGIONS)) {
      console.log(`Scraping Home Depot for region ${regionId}`);
      
      const results = await scrapeAllMaterials(storeId);
      
      for (const [sku, product] of Array.from(results.entries())) {
        itemsProcessed++;
        await updateMaterialPrice(sku, regionId, product.price, 'home_depot_scrape');
        itemsUpdated++;
      }
    }
    
    await completeJob(jobId, 'completed', itemsProcessed, itemsUpdated);
    return { jobId, status: 'completed', itemsProcessed, itemsUpdated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await completeJob(jobId, 'failed', itemsProcessed, itemsUpdated, errorMessage);
    throw error;
  }
}

export async function testScrape(): Promise<Map<string, ScrapedProduct>> {
  console.log('\n=== Scraped Material Prices ===\n');
  const results = await scrapeAllMaterials();
  
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
