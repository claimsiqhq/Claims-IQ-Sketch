import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import pg from "pg";

const { Pool } = pg;

const XACT_XML_PATH = "./attached_assets/XACTDOC_1765920648898.XML";
const BATCH_SIZE = 500;

async function importXactimate() {
  console.log("Starting COMPLETE Xactimate import...");

  // Use new database URL format with fallback to legacy
  const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("SUPABASE_DATABASE_URL is required");
    console.error("Legacy DATABASE_URL is also accepted for backwards compatibility");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
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

    await pool.query("BEGIN");

    // ==========================================
    // IMPORT CATEGORIES
    // ==========================================
    const categories = result?.PL_DOC?.CATEGORIES?.CATEGORY || [];
    const catArray = Array.isArray(categories) ? categories : [categories];
    console.log(`\nFound ${catArray.length} categories`);

    console.log("Clearing existing data...");
    await pool.query("DELETE FROM xact_line_items");
    await pool.query("DELETE FROM xact_categories");
    await pool.query("DELETE FROM xact_components");

    console.log("Importing categories...");
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
    }
    console.log(`✓ Imported ${catCount} categories`);

    // ==========================================
    // IMPORT COMPONENTS WITH PRICING
    // ==========================================
    console.log("\nImporting components with pricing...");
    const components = result?.PL_DOC?.COMPONENTS || {};
    let compCount = 0;

    // Equipment components
    const equipComps = components.EQU_COMPONENTS?.ECMP || [];
    const equipArray = Array.isArray(equipComps) ? equipComps : (equipComps ? [equipComps] : []);
    console.log(`  Equipment components: ${equipArray.length}`);

    for (const comp of equipArray) {
      await pool.query(
        `INSERT INTO xact_components (component_type, code, description, unit, amount, xact_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['equipment', comp["@_code"] || "", comp["@_dsc"] || "", comp["@_unt"] || "DAY",
         parseFloat(comp["@_amt"] || "0"), comp["@_id"] || ""]
      );
      compCount++;
    }

    // Material components (uses CMP tag, not MCMP)
    const matComps = components.MAT_COMPONENTS?.CMP || [];
    const matArray = Array.isArray(matComps) ? matComps : (matComps ? [matComps] : []);
    console.log(`  Material components: ${matArray.length}`);

    let matBatch: any[] = [];
    for (const comp of matArray) {
      matBatch.push([
        'material',
        comp["@_code"] || "",
        comp["@_dsc"] || "",
        comp["@_unt"] || "EA",
        parseFloat(comp["@_amt"] || "0"),
        comp["@_id"] || ""
      ]);

      if (matBatch.length >= BATCH_SIZE) {
        await insertComponentBatch(pool, matBatch);
        compCount += matBatch.length;
        process.stdout.write(`\r  Materials imported: ${compCount}`);
        matBatch = [];
      }
    }
    if (matBatch.length > 0) {
      await insertComponentBatch(pool, matBatch);
      compCount += matBatch.length;
    }

    // Labor components
    const labComps = components.LAB_COMPONENTS?.LCMP || [];
    const labArray = Array.isArray(labComps) ? labComps : (labComps ? [labComps] : []);
    console.log(`\n  Labor components: ${labArray.length}`);

    for (const comp of labArray) {
      await pool.query(
        `INSERT INTO xact_components (component_type, code, description, unit, amount, xact_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['labor', comp["@_code"] || "", comp["@_dsc"] || "", comp["@_unt"] || "HR",
         parseFloat(comp["@_amt"] || "0"), comp["@_id"] || ""]
      );
      compCount++;
    }

    console.log(`✓ Imported ${compCount} components with pricing`);

    // ==========================================
    // IMPORT LINE ITEMS
    // ==========================================
    console.log("\nImporting line items...");
    let itemCount = 0;
    let batchValues: any[] = [];

    const itemTree = result?.PL_DOC?.ITEM_TREE?.ITEMS || {};
    const headers = itemTree?.HDR || [];
    const hdrArray = Array.isArray(headers) ? headers : (headers ? [headers] : []);
    console.log(`  Category headers: ${hdrArray.length}`);

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
          await insertItemBatch(pool, batchValues);
          itemCount += batchValues.length;
          process.stdout.write(`\r  Line items: ${itemCount}`);
          batchValues = [];
        }
      }
    }

    if (batchValues.length > 0) {
      await insertItemBatch(pool, batchValues);
      itemCount += batchValues.length;
    }

    console.log(`\n✓ Imported ${itemCount} line items`);

    await pool.query("COMMIT");
    console.log("\n========================================");
    console.log("IMPORT COMPLETED SUCCESSFULLY!");
    console.log("========================================");

    // Final stats
    const catResult = await pool.query("SELECT COUNT(*) FROM xact_categories");
    const compResult = await pool.query("SELECT COUNT(*) FROM xact_components");
    const itemResult = await pool.query("SELECT COUNT(*) FROM xact_line_items");

    console.log(`\nDatabase totals:`);
    console.log(`  Categories:  ${catResult.rows[0].count}`);
    console.log(`  Components:  ${compResult.rows[0].count} (with pricing!)`);
    console.log(`  Line items:  ${itemResult.rows[0].count}`);

    // Component breakdown
    const compBreakdown = await pool.query(
      "SELECT component_type, COUNT(*), AVG(amount::numeric)::decimal(10,2) as avg_price FROM xact_components GROUP BY component_type"
    );
    console.log("\nComponent pricing summary:");
    compBreakdown.rows.forEach((r: any) => {
      console.log(`  ${r.component_type}: ${r.count} items, avg $${r.avg_price}`);
    });

    // Sample prices
    console.log("\nSample material prices:");
    const sampleMat = await pool.query(
      "SELECT code, description, amount FROM xact_components WHERE component_type = 'material' ORDER BY code LIMIT 5"
    );
    sampleMat.rows.forEach((r: any) => console.log(`  ${r.code}: ${r.description} = $${r.amount}`));

  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("Import failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function insertComponentBatch(pool: pg.Pool, batch: any[]) {
  const placeholders = batch.map((_, i) => {
    const offset = i * 6;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
  }).join(", ");

  await pool.query(
    `INSERT INTO xact_components (component_type, code, description, unit, amount, xact_id)
     VALUES ${placeholders}`,
    batch.flat()
  );
}

async function insertItemBatch(pool: pg.Pool, batch: any[]) {
  const placeholders = batch.map((_, i) => {
    const offset = i * 15;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15})`;
  }).join(", ");

  await pool.query(
    `INSERT INTO xact_line_items
     (item_id, xact_id, category_code, selector_code, full_code, description, unit, op_eligible, taxable, labor_efficiency, material_dist_pct, search_group, search_category, activities, metadata)
     VALUES ${placeholders}`,
    batch.flat()
  );
}

importXactimate().catch(console.error);
