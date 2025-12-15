/**
 * Quantity Engine - Claims IQ Sketch v2
 *
 * Safe formula parser and evaluator for quantity calculations.
 * Formulas are declarative strings that reference zone metrics and constants.
 *
 * DESIGN DECISIONS:
 * - No arbitrary code execution - formulas are parsed and validated
 * - Only allows predefined functions and metric references
 * - Fails gracefully with clear error messages
 * - Every calculation is explainable
 *
 * FORMULA SYNTAX:
 * - METRIC(zone) - reference a zone metric (e.g., WALL_SF(zone))
 * - Constants: numbers (e.g., 1.05, 100)
 * - Operators: +, -, *, /
 * - Functions: MIN(), MAX(), ROUND(), CEIL(), FLOOR()
 *
 * EXAMPLES:
 * - "WALL_SF(zone) * 1.05"
 * - "PERIMETER_LF(zone)"
 * - "FLOOR_SF(zone) + CEILING_SF(zone)"
 * - "MAX(FLOOR_SF(zone), 100)"
 */

import {
  ZoneMetrics,
  ZoneForMetrics,
  MissingWallForMetrics,
  SubroomForMetrics,
  computeZoneMetrics,
  getMetricValue,
} from './zoneMetrics';

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Result of a quantity calculation
 */
export interface QuantityResult {
  /** The calculated quantity value */
  quantity: number;

  /** How the quantity was determined */
  source: 'formula' | 'manual' | 'default';

  /** Human-readable explanation of the calculation */
  explanation: string;

  /** The original formula (if formula-based) */
  formula?: string;

  /** Breakdown of values used in calculation */
  breakdown?: Record<string, number>;

  /** Any warnings during calculation */
  warnings?: string[];

  /** Whether calculation succeeded */
  success: boolean;

  /** Error message if calculation failed */
  error?: string;
}

/**
 * Context for formula evaluation
 */
export interface FormulaContext {
  /** Zone metrics */
  metrics: ZoneMetrics;

  /** Additional variables that can be referenced */
  variables?: Record<string, number>;

  /** Zone damage attributes */
  zone?: {
    damageType?: string;
    damageSeverity?: string;
    waterCategory?: number;
    waterClass?: number;
    affectedSurfaces?: string[];
  };
}

/**
 * Parsed token from formula
 */
type Token =
  | { type: 'number'; value: number }
  | { type: 'operator'; value: string }
  | { type: 'function'; name: string }
  | { type: 'metric'; name: string }
  | { type: 'variable'; name: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

// ============================================
// CONSTANTS
// ============================================

/** Allowed metric references in formulas */
const ALLOWED_METRICS = new Set([
  'FLOOR_SF',
  'CEILING_SF',
  'WALL_SF',
  'WALL_SF_NET',
  'WALLS_CEILING_SF',
  'PERIMETER_LF',
  'HEIGHT_FT',
  'LONG_WALL_SF',
  'SHORT_WALL_SF',
  'ROOF_SF',
  'ROOF_SQ',
]);

/** Allowed functions in formulas */
const ALLOWED_FUNCTIONS = new Set([
  'MIN',
  'MAX',
  'ROUND',
  'CEIL',
  'FLOOR',
  'ABS',
]);

/** Operator precedence */
const PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

// ============================================
// MAIN API
// ============================================

/**
 * Calculate quantity from a formula and zone metrics
 */
export function calculateQuantity(
  formula: string,
  zone: ZoneForMetrics,
  missingWalls: MissingWallForMetrics[] = [],
  subrooms: SubroomForMetrics[] = [],
  additionalVariables?: Record<string, number>
): QuantityResult {
  try {
    // Compute zone metrics
    const metrics = computeZoneMetrics(zone, missingWalls, subrooms);

    // Create context
    const context: FormulaContext = {
      metrics,
      variables: additionalVariables,
      zone: {
        damageType: zone.damageType as string | undefined,
        damageSeverity: zone.damageSeverity as string | undefined,
        waterCategory: zone.waterCategory as number | undefined,
        waterClass: zone.waterClass as number | undefined,
        affectedSurfaces: zone.affectedSurfaces as string[] | undefined,
      },
    };

    // Evaluate formula
    return evaluateFormula(formula, context);
  } catch (error) {
    return {
      quantity: 0,
      source: 'formula',
      explanation: `Formula evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      formula,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Calculate quantity from a formula and pre-computed metrics
 */
export function calculateQuantityFromMetrics(
  formula: string,
  metrics: ZoneMetrics,
  additionalVariables?: Record<string, number>
): QuantityResult {
  const context: FormulaContext = {
    metrics,
    variables: additionalVariables,
  };

  return evaluateFormula(formula, context);
}

/**
 * Validate a formula without evaluating it
 * Returns list of errors if invalid
 */
export function validateFormula(formula: string): {
  valid: boolean;
  errors: string[];
  referencedMetrics: string[];
  referencedFunctions: string[];
} {
  const errors: string[] = [];
  const referencedMetrics: string[] = [];
  const referencedFunctions: string[] = [];

  try {
    const tokens = tokenize(formula);

    for (const token of tokens) {
      if (token.type === 'metric') {
        referencedMetrics.push(token.name);
        if (!ALLOWED_METRICS.has(token.name)) {
          errors.push(`Unknown metric: ${token.name}`);
        }
      }
      if (token.type === 'function') {
        referencedFunctions.push(token.name);
        if (!ALLOWED_FUNCTIONS.has(token.name)) {
          errors.push(`Unknown function: ${token.name}`);
        }
      }
    }

    // Try parsing to check syntax
    parseToRPN(tokens);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Parse error');
  }

  return {
    valid: errors.length === 0,
    errors,
    referencedMetrics: [...new Set(referencedMetrics)],
    referencedFunctions: [...new Set(referencedFunctions)],
  };
}

// ============================================
// FORMULA EVALUATION
// ============================================

/**
 * Evaluate a formula string against a context
 */
function evaluateFormula(formula: string, context: FormulaContext): QuantityResult {
  const warnings: string[] = [];
  const breakdown: Record<string, number> = {};

  // Handle empty/null formula
  if (!formula || formula.trim() === '') {
    return {
      quantity: 0,
      source: 'formula',
      explanation: 'No formula provided',
      formula,
      success: false,
      error: 'Empty formula',
    };
  }

  try {
    // Tokenize
    const tokens = tokenize(formula);

    // Collect metric references for breakdown
    for (const token of tokens) {
      if (token.type === 'metric') {
        const value = getMetricValue(context.metrics, token.name);
        breakdown[token.name] = value;
      }
      if (token.type === 'variable' && context.variables) {
        const value = context.variables[token.name];
        if (value !== undefined) {
          breakdown[token.name] = value;
        }
      }
    }

    // Parse to Reverse Polish Notation
    const rpn = parseToRPN(tokens);

    // Evaluate RPN
    const quantity = evaluateRPN(rpn, context, warnings);

    // Generate explanation
    const explanation = generateExplanation(formula, breakdown, quantity);

    return {
      quantity: round(quantity),
      source: 'formula',
      explanation,
      formula,
      breakdown,
      warnings: warnings.length > 0 ? warnings : undefined,
      success: true,
    };
  } catch (error) {
    return {
      quantity: 0,
      source: 'formula',
      explanation: `Calculation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      formula,
      breakdown,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// TOKENIZER
// ============================================

/**
 * Tokenize a formula string into tokens
 */
function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < formula.length) {
    // Skip whitespace
    if (/\s/.test(formula[pos])) {
      pos++;
      continue;
    }

    // Number (including decimals)
    if (/\d/.test(formula[pos]) || (formula[pos] === '.' && /\d/.test(formula[pos + 1]))) {
      let numStr = '';
      while (pos < formula.length && (/\d/.test(formula[pos]) || formula[pos] === '.')) {
        numStr += formula[pos++];
      }
      tokens.push({ type: 'number', value: parseFloat(numStr) });
      continue;
    }

    // Operator
    if ('+-*/'.includes(formula[pos])) {
      tokens.push({ type: 'operator', value: formula[pos++] });
      continue;
    }

    // Parentheses
    if (formula[pos] === '(') {
      // Check if previous token is a metric or function - if so, skip the (zone) part
      const prevToken = tokens[tokens.length - 1];
      if (prevToken && prevToken.type === 'metric') {
        // Skip "(zone)" pattern
        const closePos = formula.indexOf(')', pos);
        if (closePos !== -1) {
          pos = closePos + 1;
          continue;
        }
      }
      tokens.push({ type: 'lparen' });
      pos++;
      continue;
    }

    if (formula[pos] === ')') {
      tokens.push({ type: 'rparen' });
      pos++;
      continue;
    }

    // Comma
    if (formula[pos] === ',') {
      tokens.push({ type: 'comma' });
      pos++;
      continue;
    }

    // Identifier (function, metric, or variable)
    if (/[A-Za-z_]/.test(formula[pos])) {
      let ident = '';
      while (pos < formula.length && /[A-Za-z0-9_]/.test(formula[pos])) {
        ident += formula[pos++];
      }

      const upperIdent = ident.toUpperCase();

      // Check if it's a function
      if (ALLOWED_FUNCTIONS.has(upperIdent)) {
        tokens.push({ type: 'function', name: upperIdent });
        continue;
      }

      // Check if it's a metric
      if (ALLOWED_METRICS.has(upperIdent)) {
        tokens.push({ type: 'metric', name: upperIdent });
        continue;
      }

      // Treat as variable
      tokens.push({ type: 'variable', name: ident });
      continue;
    }

    throw new Error(`Unexpected character: ${formula[pos]} at position ${pos}`);
  }

  return tokens;
}

// ============================================
// PARSER (Shunting-yard algorithm)
// ============================================

/**
 * Parse tokens to Reverse Polish Notation using shunting-yard
 */
function parseToRPN(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const operators: Token[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'number':
      case 'metric':
      case 'variable':
        output.push(token);
        break;

      case 'function':
        operators.push(token);
        break;

      case 'operator': {
        while (
          operators.length > 0 &&
          operators[operators.length - 1].type === 'operator' &&
          PRECEDENCE[(operators[operators.length - 1] as { type: 'operator'; value: string }).value] >=
            PRECEDENCE[token.value]
        ) {
          output.push(operators.pop()!);
        }
        operators.push(token);
        break;
      }

      case 'lparen':
        operators.push(token);
        break;

      case 'rparen': {
        while (operators.length > 0 && operators[operators.length - 1].type !== 'lparen') {
          output.push(operators.pop()!);
        }
        if (operators.length === 0) {
          throw new Error('Mismatched parentheses');
        }
        operators.pop(); // Remove lparen

        // If there's a function on top, pop it to output
        if (operators.length > 0 && operators[operators.length - 1].type === 'function') {
          output.push(operators.pop()!);
        }
        break;
      }

      case 'comma':
        // Pop until we hit lparen (for function arguments)
        while (operators.length > 0 && operators[operators.length - 1].type !== 'lparen') {
          output.push(operators.pop()!);
        }
        break;
    }
  }

  // Pop remaining operators
  while (operators.length > 0) {
    const op = operators.pop()!;
    if (op.type === 'lparen' || op.type === 'rparen') {
      throw new Error('Mismatched parentheses');
    }
    output.push(op);
  }

  return output;
}

// ============================================
// RPN EVALUATOR
// ============================================

/**
 * Evaluate Reverse Polish Notation
 */
function evaluateRPN(rpn: Token[], context: FormulaContext, warnings: string[]): number {
  const stack: number[] = [];

  for (const token of rpn) {
    switch (token.type) {
      case 'number':
        stack.push(token.value);
        break;

      case 'metric': {
        const value = getMetricValue(context.metrics, token.name);
        if (value === 0 && token.name !== 'HEIGHT_FT') {
          warnings.push(`Metric ${token.name} is zero`);
        }
        stack.push(value);
        break;
      }

      case 'variable': {
        const value = context.variables?.[token.name];
        if (value === undefined) {
          warnings.push(`Variable ${token.name} not found, using 0`);
          stack.push(0);
        } else {
          stack.push(value);
        }
        break;
      }

      case 'operator': {
        if (stack.length < 2) {
          throw new Error(`Not enough operands for operator ${token.value}`);
        }
        const b = stack.pop()!;
        const a = stack.pop()!;

        switch (token.value) {
          case '+':
            stack.push(a + b);
            break;
          case '-':
            stack.push(a - b);
            break;
          case '*':
            stack.push(a * b);
            break;
          case '/':
            if (b === 0) {
              warnings.push('Division by zero, using 0');
              stack.push(0);
            } else {
              stack.push(a / b);
            }
            break;
        }
        break;
      }

      case 'function': {
        const result = evaluateFunction(token.name, stack, warnings);
        stack.push(result);
        break;
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid expression - wrong number of values');
  }

  return stack[0];
}

/**
 * Evaluate a function call
 */
function evaluateFunction(name: string, stack: number[], warnings: string[]): number {
  switch (name) {
    case 'MIN': {
      if (stack.length < 2) {
        throw new Error('MIN requires at least 2 arguments');
      }
      const b = stack.pop()!;
      const a = stack.pop()!;
      return Math.min(a, b);
    }

    case 'MAX': {
      if (stack.length < 2) {
        throw new Error('MAX requires at least 2 arguments');
      }
      const b = stack.pop()!;
      const a = stack.pop()!;
      return Math.max(a, b);
    }

    case 'ROUND': {
      if (stack.length < 1) {
        throw new Error('ROUND requires 1 argument');
      }
      return Math.round(stack.pop()!);
    }

    case 'CEIL': {
      if (stack.length < 1) {
        throw new Error('CEIL requires 1 argument');
      }
      return Math.ceil(stack.pop()!);
    }

    case 'FLOOR': {
      if (stack.length < 1) {
        throw new Error('FLOOR requires 1 argument');
      }
      return Math.floor(stack.pop()!);
    }

    case 'ABS': {
      if (stack.length < 1) {
        throw new Error('ABS requires 1 argument');
      }
      return Math.abs(stack.pop()!);
    }

    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

// ============================================
// EXPLANATION GENERATION
// ============================================

/**
 * Generate human-readable explanation of calculation
 */
function generateExplanation(
  formula: string,
  breakdown: Record<string, number>,
  result: number
): string {
  const parts: string[] = [`Formula: ${formula}`];

  if (Object.keys(breakdown).length > 0) {
    parts.push('Values:');
    for (const [key, value] of Object.entries(breakdown)) {
      parts.push(`  ${key} = ${value}`);
    }
  }

  parts.push(`Result: ${result}`);

  return parts.join('\n');
}

/**
 * Round to reasonable precision
 */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Create a manual quantity result
 */
export function createManualQuantityResult(
  quantity: number,
  reason?: string
): QuantityResult {
  return {
    quantity,
    source: 'manual',
    explanation: reason || 'Manually entered quantity',
    success: true,
  };
}

/**
 * Create a default quantity result
 */
export function createDefaultQuantityResult(
  quantity: number,
  reason: string
): QuantityResult {
  return {
    quantity,
    source: 'default',
    explanation: reason,
    success: true,
  };
}

/**
 * Get list of all available metrics for documentation
 */
export function getAvailableMetrics(): { name: string; description: string }[] {
  return [
    { name: 'FLOOR_SF', description: 'Floor square footage' },
    { name: 'CEILING_SF', description: 'Ceiling square footage' },
    { name: 'WALL_SF', description: 'Total wall square footage (gross)' },
    { name: 'WALL_SF_NET', description: 'Wall square footage minus openings' },
    { name: 'WALLS_CEILING_SF', description: 'Walls (net) plus ceiling' },
    { name: 'PERIMETER_LF', description: 'Floor perimeter in linear feet' },
    { name: 'HEIGHT_FT', description: 'Ceiling height in feet' },
    { name: 'LONG_WALL_SF', description: 'Longer wall square footage' },
    { name: 'SHORT_WALL_SF', description: 'Shorter wall square footage' },
    { name: 'ROOF_SF', description: 'Roof square footage (pitch-adjusted)' },
    { name: 'ROOF_SQ', description: 'Roofing squares (100 SF)' },
  ];
}

/**
 * Get list of all available functions for documentation
 */
export function getAvailableFunctions(): { name: string; description: string; example: string }[] {
  return [
    { name: 'MIN', description: 'Returns minimum of two values', example: 'MIN(FLOOR_SF(zone), 1000)' },
    { name: 'MAX', description: 'Returns maximum of two values', example: 'MAX(FLOOR_SF(zone), 100)' },
    { name: 'ROUND', description: 'Rounds to nearest integer', example: 'ROUND(WALL_SF(zone) * 1.1)' },
    { name: 'CEIL', description: 'Rounds up to integer', example: 'CEIL(ROOF_SQ(zone))' },
    { name: 'FLOOR', description: 'Rounds down to integer', example: 'FLOOR(PERIMETER_LF(zone))' },
    { name: 'ABS', description: 'Returns absolute value', example: 'ABS(adjustment)' },
  ];
}
