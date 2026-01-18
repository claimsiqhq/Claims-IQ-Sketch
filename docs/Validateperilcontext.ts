export type PerilConfidence = 'high' | 'medium' | 'low';

export interface RawPerilInput {
  primary_peril: string | null;
  secondary_perils: string[] | null;
  peril_confidence?: PerilConfidence;
  peril_conflicts?: string[];
  classification_reasoning?: string;
}

export interface CanonicalPerilContext {
  primary_peril_code: string;
  secondary_peril_codes: string[];
  peril_confidence: PerilConfidence;
  peril_conflicts: string[];
  source: 'fnol';
  reasoning?: string;
}

interface PerilRecord {
  code: string;
  allows_secondary: boolean;
  is_active: boolean;
}

interface PerilAlias {
  alias: string;
  peril_code: string;
}

interface ValidatorDeps {
  perils: PerilRecord[];
  aliases: PerilAlias[];
}

export function validatePerilContext(
  input: RawPerilInput,
  deps: ValidatorDeps
): CanonicalPerilContext {
  const perilMap = new Map(
    deps.perils.filter(p => p.is_active).map(p => [p.code.toLowerCase(), p])
  );

  const aliasMap = new Map(
    deps.aliases.map(a => [a.alias.toLowerCase(), a.peril_code.toLowerCase()])
  );

  function normalize(raw: string | null): string | null {
    if (!raw) return null;
    const key = raw.trim().toLowerCase();
    if (perilMap.has(key)) return key;
    if (aliasMap.has(key)) return aliasMap.get(key)!;
    return null;
  }

  const primary =
    normalize(input.primary_peril) ??
    'unknown';

  const primaryRecord = perilMap.get(primary);

  let secondary: string[] = [];

  if (input.secondary_perils && primaryRecord?.allows_secondary) {
    secondary = input.secondary_perils
      .map(p => normalize(p))
      .filter((p): p is string => !!p && p !== primary);
  }

  return {
    primary_peril_code: primary,
    secondary_peril_codes: secondary,
    peril_confidence: input.peril_confidence ?? 'low',
    peril_conflicts: input.peril_conflicts ?? [],
    source: 'fnol',
    reasoning: input.classification_reasoning
  };
}
