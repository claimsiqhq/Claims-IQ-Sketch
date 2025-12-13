-- Validation queries for seed data

-- Check for orphaned category references
SELECT 'Orphaned category references:' as check_name;
SELECT code, category_id FROM line_items 
WHERE category_id NOT IN (SELECT id FROM line_item_categories);

-- Check for duplicate codes
SELECT 'Duplicate line item codes:' as check_name;
SELECT code, COUNT(*) as count FROM line_items GROUP BY code HAVING COUNT(*) > 1;

-- Check for duplicate SKUs
SELECT 'Duplicate material SKUs:' as check_name;
SELECT sku, COUNT(*) as count FROM materials GROUP BY sku HAVING COUNT(*) > 1;

-- Count items by category
SELECT 'Line items per category:' as check_name;
SELECT category_id, COUNT(*) as count 
FROM line_items 
GROUP BY category_id 
ORDER BY category_id;

-- Count total line items
SELECT 'Total line items:' as check_name, COUNT(*) as count FROM line_items;

-- Count total materials
SELECT 'Total materials:' as check_name, COUNT(*) as count FROM materials;

-- Verify JSON is valid (will error if invalid)
SELECT 'Verifying JSON validity:' as check_name;
SELECT code 
FROM line_items 
WHERE material_components IS NOT NULL 
  AND jsonb_typeof(material_components) != 'array'
LIMIT 5;
