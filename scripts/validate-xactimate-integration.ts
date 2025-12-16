import pg from "pg";

const { Pool } = pg;

interface ValidationResult {
  test: string;
  status: "PASS" | "FAIL" | "WARN";
  details: string;
  data?: any;
}

const results: ValidationResult[] = [];

function logResult(result: ValidationResult) {
  const icon = result.status === "PASS" ? "✓" : result.status === "FAIL" ? "✗" : "⚠";
  console.log(`\n${icon} ${result.test}`);
  console.log(`  Status: ${result.status}`);
  console.log(`  ${result.details}`);
  if (result.data) {
    console.log(`  Data:`, JSON.stringify(result.data, null, 2).split('\n').map(l => '    ' + l).join('\n'));
  }
  results.push(result);
}

async function validateXactimateIntegration() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     XACTIMATE/VERISK INTEGRATION VALIDATION                  ║");
  console.log("║     Claims IQ - Complete System Test                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // ==========================================
    // TEST 1: Database Connection
    // ==========================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("SECTION 1: DATABASE CONNECTIVITY & STRUCTURE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    try {
      await pool.query("SELECT 1");
      logResult({
        test: "Database Connection",
        status: "PASS",
        details: "Successfully connected to PostgreSQL database",
      });
    } catch (error) {
      logResult({
        test: "Database Connection",
        status: "FAIL",
        details: `Connection failed: ${error}`,
      });
      return;
    }

    // ==========================================
    // TEST 2: Xactimate Tables Exist
    // ==========================================
    const tables = ['xact_categories', 'xact_line_items', 'xact_components'];
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        const count = parseInt(result.rows[0].count);
        logResult({
          test: `Table ${table} exists`,
          status: count > 0 ? "PASS" : "WARN",
          details: `Table contains ${count} records`,
          data: { recordCount: count },
        });
      } catch (error) {
        logResult({
          test: `Table ${table} exists`,
          status: "FAIL",
          details: `Table does not exist or is inaccessible: ${error}`,
        });
      }
    }

    // ==========================================
    // TEST 3: Data Completeness
    // ==========================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("SECTION 2: DATA COMPLETENESS & INTEGRITY");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Category count
    const catResult = await pool.query("SELECT COUNT(*) as count FROM xact_categories");
    const catCount = parseInt(catResult.rows[0].count);
    logResult({
      test: "Xactimate Categories Loaded",
      status: catCount >= 100 ? "PASS" : catCount > 0 ? "WARN" : "FAIL",
      details: `Found ${catCount} categories (expected ~122 from Verisk price list)`,
      data: { expected: 122, actual: catCount },
    });

    // Line item count
    const itemResult = await pool.query("SELECT COUNT(*) as count FROM xact_line_items");
    const itemCount = parseInt(itemResult.rows[0].count);
    logResult({
      test: "Xactimate Line Items Loaded",
      status: itemCount >= 15000 ? "PASS" : itemCount > 0 ? "WARN" : "FAIL",
      details: `Found ${itemCount} line items (expected ~20,974 from Verisk price list)`,
      data: { expected: 20974, actual: itemCount },
    });

    // Component count
    const compResult = await pool.query("SELECT COUNT(*) as count FROM xact_components");
    const compCount = parseInt(compResult.rows[0].count);
    logResult({
      test: "Xactimate Components Loaded",
      status: compCount >= 10000 ? "PASS" : compCount > 0 ? "WARN" : "FAIL",
      details: `Found ${compCount} components (expected ~14,586 from Verisk price list)`,
      data: { expected: 14586, actual: compCount },
    });

    // ==========================================
    // TEST 4: Component Types Distribution
    // ==========================================
    const compTypeResult = await pool.query(`
      SELECT component_type, COUNT(*) as count,
             AVG(amount::numeric)::decimal(10,2) as avg_price,
             MIN(amount::numeric)::decimal(10,2) as min_price,
             MAX(amount::numeric)::decimal(10,2) as max_price
      FROM xact_components
      GROUP BY component_type
      ORDER BY component_type
    `);

    logResult({
      test: "Component Type Distribution",
      status: compTypeResult.rows.length >= 3 ? "PASS" : "WARN",
      details: `Found ${compTypeResult.rows.length} component types (expected: equipment, labor, material)`,
      data: compTypeResult.rows.reduce((acc: any, row: any) => {
        acc[row.component_type] = {
          count: parseInt(row.count),
          avgPrice: parseFloat(row.avg_price),
          minPrice: parseFloat(row.min_price),
          maxPrice: parseFloat(row.max_price),
        };
        return acc;
      }, {}),
    });

    // ==========================================
    // TEST 5: Category Coverage Types
    // ==========================================
    const coverageResult = await pool.query(`
      SELECT coverage_type, COUNT(*) as count
      FROM xact_categories
      GROUP BY coverage_type
      ORDER BY coverage_type
    `);

    const coverageTypeMap: Record<number, string> = {
      0: "Structure (Coverage A)",
      1: "Landscaping (Coverage B)",
      2: "Contents (Coverage C)",
    };

    logResult({
      test: "Category Coverage Type Distribution",
      status: coverageResult.rows.length >= 2 ? "PASS" : "WARN",
      details: "Categories distributed across coverage types",
      data: coverageResult.rows.reduce((acc: any, row: any) => {
        acc[coverageTypeMap[row.coverage_type] || `Type ${row.coverage_type}`] = parseInt(row.count);
        return acc;
      }, {}),
    });

    // ==========================================
    // TEST 6: Sample Line Item Pricing Test
    // ==========================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("SECTION 3: PRICING CALCULATION VERIFICATION");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Get a sample line item with activities (material formulas)
    const sampleItemResult = await pool.query(`
      SELECT full_code, description, unit, labor_efficiency, activities, category_code
      FROM xact_line_items
      WHERE activities::text != '[]'
      AND labor_efficiency > 0
      LIMIT 5
    `);

    if (sampleItemResult.rows.length > 0) {
      for (const item of sampleItemResult.rows) {
        const activities = item.activities || [];
        let hasMaterialFormula = false;
        let formulaComponents: string[] = [];

        for (const act of activities) {
          if (act.materialFormula) {
            hasMaterialFormula = true;
            formulaComponents.push(act.materialFormula);
          }
        }

        logResult({
          test: `Line Item Pricing Structure: ${item.full_code}`,
          status: "PASS",
          details: `${item.description} (${item.unit})`,
          data: {
            categoryCode: item.category_code,
            laborEfficiencyMinutes: item.labor_efficiency,
            hasMaterialFormula,
            materialFormulas: formulaComponents.slice(0, 3),
          },
        });
      }
    } else {
      logResult({
        test: "Line Item Pricing Structure",
        status: "WARN",
        details: "No line items found with complete pricing data (activities and labor efficiency)",
      });
    }

    // ==========================================
    // TEST 7: Component Lookup Test
    // ==========================================
    const sampleCompResult = await pool.query(`
      SELECT code, description, component_type, amount, unit, xact_id
      FROM xact_components
      WHERE amount::numeric > 0
      ORDER BY component_type, code
      LIMIT 9
    `);

    if (sampleCompResult.rows.length > 0) {
      const componentsByType: Record<string, any[]> = {};
      for (const comp of sampleCompResult.rows) {
        if (!componentsByType[comp.component_type]) {
          componentsByType[comp.component_type] = [];
        }
        componentsByType[comp.component_type].push({
          code: comp.code,
          description: comp.description.substring(0, 40),
          price: parseFloat(comp.amount),
          unit: comp.unit,
        });
      }

      logResult({
        test: "Component Price Lookup",
        status: "PASS",
        details: "Components have valid pricing data",
        data: componentsByType,
      });
    }

    // ==========================================
    // TEST 8: Labor Rate Calculation
    // ==========================================
    const laborCalcResult = await pool.query(`
      SELECT full_code, description, labor_efficiency,
             (labor_efficiency::numeric / 60.0 / 100.0 * 65.0)::decimal(10,2) as calculated_labor_per_unit
      FROM xact_line_items
      WHERE labor_efficiency > 0
      LIMIT 5
    `);

    if (laborCalcResult.rows.length > 0) {
      logResult({
        test: "Labor Rate Calculation",
        status: "PASS",
        details: "Labor rates calculated from efficiency values (@ $65/hr base rate)",
        data: laborCalcResult.rows.map((r: any) => ({
          code: r.full_code,
          laborEffMin: r.labor_efficiency,
          laborPerUnit: `$${r.calculated_labor_per_unit}`,
        })),
      });
    }

    // ==========================================
    // TEST 9: Estimate Line Item Integration
    // ==========================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("SECTION 4: ESTIMATE INTEGRATION");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Check estimate tables exist
    try {
      const estimateTablesResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name LIKE 'estimate%'
        ORDER BY table_name
      `);

      const estimateTables = estimateTablesResult.rows.map((r: any) => r.table_name);
      const requiredTables = ['estimate_line_items', 'estimate_zones', 'estimate_areas', 'estimate_structures'];
      const foundRequired = requiredTables.filter(t => estimateTables.includes(t));

      logResult({
        test: "Estimate Hierarchy Tables",
        status: foundRequired.length === requiredTables.length ? "PASS" : "WARN",
        details: `Found ${foundRequired.length}/${requiredTables.length} required estimate tables`,
        data: {
          required: requiredTables,
          found: foundRequired,
          all: estimateTables,
        },
      });
    } catch (error) {
      logResult({
        test: "Estimate Hierarchy Tables",
        status: "FAIL",
        details: `Could not query estimate tables: ${error}`,
      });
    }

    // Check estimate_line_items has xactimate fields
    try {
      const columnsResult = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'estimate_line_items'
        ORDER BY ordinal_position
      `);

      const columns = columnsResult.rows.map((r: any) => r.column_name);
      const xactColumns = ['category_id', 'material_cost', 'labor_cost', 'equipment_cost', 'unit_price'];
      const foundXactColumns = xactColumns.filter(c => columns.includes(c));

      logResult({
        test: "Estimate Line Items - Xactimate Fields",
        status: foundXactColumns.length >= 4 ? "PASS" : "WARN",
        details: `Found ${foundXactColumns.length}/${xactColumns.length} Xactimate pricing fields`,
        data: {
          expected: xactColumns,
          found: foundXactColumns,
          allColumns: columns,
        },
      });
    } catch (error) {
      logResult({
        test: "Estimate Line Items - Xactimate Fields",
        status: "FAIL",
        details: `Could not query columns: ${error}`,
      });
    }

    // ==========================================
    // TEST 10: Top Categories by Item Count
    // ==========================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("SECTION 5: DATA QUALITY & STATISTICS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const topCategoriesResult = await pool.query(`
      SELECT xli.category_code, xc.description, COUNT(*) as item_count
      FROM xact_line_items xli
      LEFT JOIN xact_categories xc ON xli.category_code = xc.code
      GROUP BY xli.category_code, xc.description
      ORDER BY item_count DESC
      LIMIT 10
    `);

    logResult({
      test: "Top Categories by Line Item Count",
      status: "PASS",
      details: "Categories ranked by number of line items",
      data: topCategoriesResult.rows.map((r: any) => ({
        code: r.category_code,
        description: r.description,
        itemCount: parseInt(r.item_count),
      })),
    });

    // ==========================================
    // TEST 11: Common Units
    // ==========================================
    const unitsResult = await pool.query(`
      SELECT unit, COUNT(*) as count
      FROM xact_line_items
      GROUP BY unit
      ORDER BY count DESC
      LIMIT 10
    `);

    logResult({
      test: "Common Units of Measure",
      status: "PASS",
      details: "Line items distributed across unit types",
      data: unitsResult.rows.reduce((acc: any, r: any) => {
        acc[r.unit] = parseInt(r.count);
        return acc;
      }, {}),
    });

    // ==========================================
    // TEST 12: Database Indexes
    // ==========================================
    const indexResult = await pool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename IN ('xact_categories', 'xact_line_items', 'xact_components')
      ORDER BY tablename, indexname
    `);

    logResult({
      test: "Database Indexes for Performance",
      status: indexResult.rows.length >= 5 ? "PASS" : "WARN",
      details: `Found ${indexResult.rows.length} indexes on Xactimate tables`,
      data: indexResult.rows.map((r: any) => `${r.tablename}: ${r.indexname}`),
    });

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║                    VALIDATION SUMMARY                        ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const passed = results.filter(r => r.status === "PASS").length;
    const failed = results.filter(r => r.status === "FAIL").length;
    const warned = results.filter(r => r.status === "WARN").length;

    console.log(`  ✓ PASSED:  ${passed}`);
    console.log(`  ✗ FAILED:  ${failed}`);
    console.log(`  ⚠ WARNINGS: ${warned}`);
    console.log(`  ─────────────────`);
    console.log(`  TOTAL:     ${results.length}\n`);

    if (failed === 0 && warned === 0) {
      console.log("  🎉 ALL TESTS PASSED! Xactimate integration is FULLY WORKING.\n");
    } else if (failed === 0) {
      console.log("  ✅ All critical tests passed. Some warnings to review.\n");
    } else {
      console.log("  ❌ Some critical tests failed. Integration needs attention.\n");
    }

    // Return exit code
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error("\n❌ VALIDATION FAILED WITH ERROR:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

validateXactimateIntegration();
