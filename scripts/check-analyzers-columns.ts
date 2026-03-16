import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function checkColumns() {
  const db = getDatabaseClient();

  try {
    const result = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'analyzers'
      ORDER BY ordinal_position
    `);

    console.log('📋 analyzers table columns:');
    result.rows.forEach(row => console.log('  -', row.column_name, ':', row.data_type));

  } finally {
    await db.end();
  }
}

checkColumns();
