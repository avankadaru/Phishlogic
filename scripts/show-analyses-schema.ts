#!/usr/bin/env tsx

import { initDatabase, closeDatabase } from '../src/infrastructure/database/client.js';

async function showSchema() {
  const pool = initDatabase();

  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'analyses'
    ORDER BY ordinal_position;
  `);

  console.log('\n=== analyses table columns ===\n');
  result.rows.forEach((row) => {
    console.log(`${row.column_name}: ${row.data_type}`);
  });

  await closeDatabase();
  process.exit(0);
}

showSchema();
