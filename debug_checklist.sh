#!/bin/bash
# Checklist Generation Diagnostic Script
# Usage: ./debug_checklist.sh <CLAIM_ID>

if [ -z "$1" ]; then
  echo "Usage: ./debug_checklist.sh <CLAIM_ID>"
  echo "Example: ./debug_checklist.sh 123e4567-e89b-12d3-a456-426614174000"
  exit 1
fi

CLAIM_ID="$1"

echo "=========================================="
echo "Checklist Generation Diagnostic"
echo "=========================================="
echo ""
echo "Claim ID: $CLAIM_ID"
echo ""

# Check if claim exists and has required data
echo "1. Checking claim data..."
psql $DATABASE_URL -c "
SELECT 
  id,
  claim_number,
  primary_peril,
  total_rcv,
  status,
  organization_id,
  CASE 
    WHEN primary_peril IS NULL THEN '❌ MISSING'
    WHEN primary_peril = '' THEN '❌ EMPTY'
    ELSE '✅ SET: ' || primary_peril
  END as peril_status
FROM claims 
WHERE id = '$CLAIM_ID';
" 2>/dev/null || echo "⚠️  Could not query database. Make sure DATABASE_URL is set."

echo ""
echo "2. Checking existing checklists..."
psql $DATABASE_URL -c "
SELECT 
  id,
  claim_id,
  peril,
  severity,
  status,
  total_items,
  completed_items,
  created_at
FROM claim_checklists
WHERE claim_id = '$CLAIM_ID'
ORDER BY created_at DESC
LIMIT 5;
" 2>/dev/null || echo "⚠️  Could not query database."

echo ""
echo "3. Checking checklist items..."
psql $DATABASE_URL -c "
SELECT 
  cci.id,
  cci.checklist_id,
  cci.title,
  cci.category,
  cci.status,
  cci.required_for_perils,
  cci.required_for_severities
FROM claim_checklist_items cci
WHERE cci.checklist_id IN (
  SELECT id FROM claim_checklists WHERE claim_id = '$CLAIM_ID'
)
ORDER BY cci.sort_order
LIMIT 20;
" 2>/dev/null || echo "⚠️  Could not query database."

echo ""
echo "=========================================="
echo "Diagnostic Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify claim has primary_peril set"
echo "2. Check if checklist exists but has 0 items"
echo "3. Try regenerating the checklist via API"
echo "4. Check server logs for checklist generation errors"
