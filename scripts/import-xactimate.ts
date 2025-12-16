import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import pg from "pg";

const { Pool } = pg;

const XACT_XML_PATH = "./attached_assets/XACTDOC_1765920648898.XML";
const BATCH_SIZE = 500;

async function importXactimate() {
  console.log("Starting Xactimate import...");
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("Reading XML file...");
    const xmlContent = fs.readFileSync(XACT_XML_PATH, "utf-8");
    console.log(`XML file size: ${(xmlContent.length / 1024 / 1024).toFixed(2)} MB`);

    console.log("Parsing XML...");
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "_text",
    });
    
    const result = parser.parse(xmlContent);
    console.log("XML parsed successfully");

    const categories = result?.PL_DOC?.CATEGORIES?.CATEGORY || [];
    const catArray = Array.isArray(categories) ? categories : [categories];
    console.log(`Found ${catArray.length} categories`);

    await pool.query("BEGIN");

    console.log("\nClearing existing data...");
    await pool.query("DELETE FROM xact_line_items");
    await pool.query("DELETE FROM xact_categories");

    console.log("\nImporting categories...");
    let catCount = 0;
    for (const cat of catArray) {
      const catId = parseInt(cat["@_catId"] || cat["@_id"] || "0");
      const xactId = parseInt(cat["@_id"] || "0");
      const code = cat["@_code"] || "";
      const description = cat["@_desc"] || "";
      const coverageType = parseInt(cat["@_cv"] || "0");
      const laborDistPct = parseInt(cat["@_labDist"] || "0");
      const materialDistPct = parseInt(cat["@_matDist"] || "100");
      const opEligible = cat["@_op"] !== "0";
      const taxable = cat["@_tax"] !== "0";
      const noPrefix = cat["@_noPrefix"] === "1";

      if (!code) continue;

      await pool.query(
        `INSERT INTO xact_categories (cat_id, xact_id, code, description, coverage_type, labor_dist_pct, material_dist_pct, op_eligible, taxable, no_prefix)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
        [catId, xactId, code, description, coverageType, laborDistPct, materialDistPct, opEligible, taxable, noPrefix]
      );
      catCount++;
      if (catCount % 20 === 0) {
        process.stdout.write(`\rCategories: ${catCount}/${catArray.length}`);
      }
    }
    console.log(`\nImported ${catCount} categories`);

    console.log("\nImporting line items...");
    let itemCount = 0;
    let batchValues: any[] = [];

    const itemTree = result?.PL_DOC?.ITEM_TREE?.ITEMS || {};
    const headers = itemTree?.HDR || [];
    const hdrArray = Array.isArray(headers) ? headers : (headers ? [headers] : []);
    console.log(`Found ${hdrArray.length} category headers with items`);

    for (const hdr of hdrArray) {
      const categoryCode = hdr["@_cat"] || "";
      if (!categoryCode) continue;

      const itemsContainer = hdr.ITEMS;
      if (!itemsContainer) continue;

      const items = itemsContainer.ITEM || [];
      const itemArray = Array.isArray(items) ? items : (items ? [items] : []);

      for (const item of itemArray) {
        const itemId = parseInt(item["@_itemId"] || "0");
        const xactId = parseInt(item["@_id"] || "0");
        const selectorCode = item["@_sel"] || "";
        const fullCode = `${categoryCode}${selectorCode}`;
        const description = item["@_dsc"] || "";
        const unit = item["@_un"] || "";
        const opEligible = item["@_op"] !== "0";
        const taxable = item["@_tax"] !== "0";
        const laborEfficiency = item["@_le"] ? parseInt(item["@_le"]) : null;
        const materialDistPct = item["@_mdp"] ? parseInt(item["@_mdp"]) : null;
        const searchGroup = item["@_sg"] || null;
        const searchCategory = item["@_sc"] || null;

        const activities = item.ACT || [];
        const actArray = Array.isArray(activities) ? activities : (activities ? [activities] : []);
        const actData = actArray.map((act: any) => ({
          phase: act["@_ph"] || "",
          description: act["@_d_inc"] || "",
          laborFormula: act["@_a_l"] || "",
          materialFormula: act["@_a_m"] || "",
          actCode: act["@_act"] || "",
        }));

        batchValues.push([
          itemId, xactId, categoryCode, selectorCode, fullCode,
          description, unit, opEligible, taxable, laborEfficiency,
          materialDistPct, searchGroup, searchCategory,
          JSON.stringify(actData), JSON.stringify({})
        ]);

        if (batchValues.length >= BATCH_SIZE) {
          await insertBatch(pool, batchValues);
          itemCount += batchValues.length;
          process.stdout.write(`\rLine items: ${itemCount}`);
          batchValues = [];
        }
      }
    }

    if (batchValues.length > 0) {
      await insertBatch(pool, batchValues);
      itemCount += batchValues.length;
    }

    console.log(`\nImported ${itemCount} line items`);

    await pool.query("COMMIT");
    console.log("\n✓ Import completed successfully!");

    const catResult = await pool.query("SELECT COUNT(*) FROM xact_categories");
    const itemResult = await pool.query("SELECT COUNT(*) FROM xact_line_items");
    console.log(`\nDatabase totals:`);
    console.log(`  Categories: ${catResult.rows[0].count}`);
    console.log(`  Line items: ${itemResult.rows[0].count}`);

    console.log("\nSample categories:");
    const sampleCats = await pool.query("SELECT code, description FROM xact_categories ORDER BY code LIMIT 5");
    sampleCats.rows.forEach((r: any) => console.log(`  ${r.code}: ${r.description}`));

    console.log("\nSample line items:");
    const sampleItems = await pool.query("SELECT full_code, description, unit FROM xact_line_items ORDER BY full_code LIMIT 5");
    sampleItems.rows.forEach((r: any) => console.log(`  ${r.full_code}: ${r.description} (${r.unit})`));

  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Import failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function insertBatch(pool: pg.Pool, batch: any[]) {
  const placeholders = batch.map((_, i) => {
    const offset = i * 15;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15})`;
  }).join(", ");

  const values = batch.flat();

  await pool.query(
    `INSERT INTO xact_line_items 
     (item_id, xact_id, category_code, selector_code, full_code, description, unit, op_eligible, taxable, labor_efficiency, material_dist_pct, search_group, search_category, activities, metadata)
     VALUES ${placeholders}`,
    values
  );
}

importXactimate().catch(console.error);
