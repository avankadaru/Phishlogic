/**
 * JSONB Type Converter
 *
 * Centralized JSONB serialization logic using Type Converter Pattern.
 * This prevents the need to manually stringify JSONB columns in every repository.
 *
 * Design Pattern: Type Converter Pattern
 * - Single source of truth for JSONB column handling
 * - Automatic serialization of Date objects and undefined values
 * - Type-safe and maintainable
 *
 * Key Principle: pg expects JavaScript objects for JSONB columns.
 * We ONLY need to prepare the data (convert Dates, remove undefined),
 * then let pg handle JSON.stringify() automatically.
 */

/**
 * Metadata for table columns
 * Defines which columns are JSONB for automatic handling
 */
export interface TableColumnMetadata {
  tableName: string;
  jsonbColumns: string[];
}

/**
 * Registry of JSONB columns per table
 * Add new tables here when they have JSONB columns
 */
export const JSONB_COLUMNS_REGISTRY: Record<string, string[]> = {
  analyses: [
    'input_data',
    'red_flags',
    'signals',
    'execution_steps',
    'ai_metadata',
    'timing_metadata',
    'error_details',
  ],
  // Add more tables as needed
  // whitelist_entries: ['metadata'],
  // integration_tasks: ['config'],
};

/**
 * Check if a column is JSONB type
 */
export function isJsonbColumn(tableName: string, columnName: string): boolean {
  const jsonbColumns = JSONB_COLUMNS_REGISTRY[tableName];
  return jsonbColumns ? jsonbColumns.includes(columnName) : false;
}

/**
 * Prepare value for JSONB column
 *
 * This function:
 * 1. Recursively converts Date objects to ISO strings
 * 2. Removes undefined values (not valid in JSON)
 * 3. Returns a plain JavaScript object/array
 *
 * IMPORTANT: Does NOT call JSON.stringify()!
 * The pg driver will stringify automatically.
 */
export function prepareJsonbValue(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }

  // Convert Date objects to ISO strings
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => prepareJsonbValue(item));
  }

  // Handle objects
  if (typeof value === 'object') {
    const prepared: any = {};
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        const preparedValue = prepareJsonbValue(value[key]);
        // Only include non-undefined values
        if (preparedValue !== undefined) {
          prepared[key] = preparedValue;
        }
      }
    }
    return prepared;
  }

  // Return primitives as-is
  return value;
}

/**
 * Process all values in a data object
 * Automatically prepares JSONB columns based on table metadata
 *
 * This is called by BaseRepository before passing data to pg.
 *
 * IMPORTANT: For JSONB columns, we:
 * 1. Convert Date objects to ISO strings (prepareJsonbValue)
 * 2. Stringify to JSON string for pg
 *
 * This is necessary because pg expects JSONB columns as strings,
 * not JavaScript objects.
 */
export function processValuesForTable(
  tableName: string,
  data: Record<string, any>
): Record<string, any> {
  const processed: Record<string, any> = {};

  for (const [columnName, value] of Object.entries(data)) {
    if (value === undefined) {
      continue; // Skip undefined values
    }

    // Automatically prepare and stringify JSONB columns
    if (isJsonbColumn(tableName, columnName)) {
      const prepared = prepareJsonbValue(value);
      // Stringify for JSONB - pg expects strings for JSONB columns
      processed[columnName] = JSON.stringify(prepared);
    } else {
      processed[columnName] = value;
    }
  }

  return processed;
}

/**
 * Parse JSONB value from database
 * pg returns JSONB as parsed objects, but this helper
 * ensures consistent handling if needed
 */
export function parseJsonbValue<T = any>(value: any): T | null {
  if (value === null || value === undefined) {
    return null;
  }

  // If it's already an object, return it
  if (typeof value === 'object') {
    return value as T;
  }

  // If it's a string, parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  return null;
}
