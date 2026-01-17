/**
 * Database Transaction Utilities
 * 
 * Provides transaction support for multi-step database operations.
 * Note: Supabase doesn't support transactions directly via the client,
 * so we use PostgreSQL RPC functions or raw SQL for transactional operations.
 * 
 * For simple cases, use this utility to ensure atomicity where possible.
 * For complex transactions, consider creating PostgreSQL functions.
 */

import { supabaseAdmin } from './supabaseAdmin';

/**
 * Execute multiple database operations in a transaction-like manner.
 * 
 * This function attempts to ensure atomicity by:
 * 1. Executing operations sequentially
 * 2. Rolling back on error (by throwing, which should trigger cleanup)
 * 
 * Note: True transaction support requires PostgreSQL functions or raw SQL.
 * For critical operations, consider creating a PostgreSQL function that handles
 * the transaction internally.
 * 
 * @param operations Array of async functions that perform database operations
 * @returns Array of results from each operation
 * @throws Error if any operation fails
 */
export async function executeInTransaction<T>(
  operations: Array<() => Promise<T>>
): Promise<T[]> {
  const results: T[] = [];
  
  try {
    for (const operation of operations) {
      const result = await operation();
      results.push(result);
    }
    return results;
  } catch (error) {
    // In a true transaction, we would rollback here
    // For now, we throw the error and let the caller handle cleanup
    throw error;
  }
}

/**
 * Create a PostgreSQL transaction using RPC.
 * 
 * This requires a PostgreSQL function to be created that handles the transaction.
 * Example function:
 * 
 * CREATE OR REPLACE FUNCTION execute_transaction(operations jsonb)
 * RETURNS jsonb AS $$
 * BEGIN
 *   -- Execute operations within a transaction
 *   -- Return results
 * END;
 * $$ LANGUAGE plpgsql;
 * 
 * @param functionName Name of the PostgreSQL function to call
 * @param params Parameters to pass to the function
 * @returns Result from the function
 */
export async function executeTransactionRPC(
  functionName: string,
  params: Record<string, any>
): Promise<any> {
  const { data, error } = await supabaseAdmin.rpc(functionName, params);
  
  if (error) {
    throw new Error(`Transaction failed: ${error.message}`);
  }
  
  return data;
}

// Note: saveEstimateTransaction function was removed as it was a deprecated placeholder.
// Use individual estimate service functions (saveEstimate, addLineItemToZone, etc.) instead.
// If transactional saves are required, implement a PostgreSQL function and use executeTransactionRPC().
