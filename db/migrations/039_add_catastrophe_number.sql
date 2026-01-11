-- Add catastrophe number tracking to claims table
-- This enables CAT-based intelligence by grouping claims from the same event

ALTER TABLE claims
ADD COLUMN IF NOT EXISTS catastrophe_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_claims_catastrophe_number
ON claims(catastrophe_number)
WHERE catastrophe_number IS NOT NULL;

COMMENT ON COLUMN claims.catastrophe_number IS
'Catastrophe event identifier extracted from claim number (e.g., CAT-PCS2532-2532)';
