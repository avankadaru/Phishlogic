import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function checkAllAnalyzers() {
  const db = getDatabaseClient();

  try {
    console.log('🔍 Checking All Analyzer Sources\n');

    // Check analyzers table
    const analyzersTable = await db.query(`
      SELECT analyzer_name, display_name, is_active
      FROM analyzers
      ORDER BY analyzer_name
    `);
    console.log(`📋 analyzers table (${analyzersTable.rows.length} records):`);
    analyzersTable.rows.forEach(row => {
      console.log(`  - ${row.analyzer_name} (${row.display_name}) - Active: ${row.is_active}`);
    });

    // Check integration_analyzers (unique analyzer names)
    const integrationAnalyzers = await db.query(`
      SELECT DISTINCT analyzer_name
      FROM integration_analyzers
      ORDER BY analyzer_name
    `);
    console.log(`\n📋 integration_analyzers table (${integrationAnalyzers.rows.length} unique analyzers):`);
    integrationAnalyzers.rows.forEach(row => {
      console.log(`  - ${row.analyzer_name}`);
    });

    // Check task_analyzers (unique analyzer names)
    const taskAnalyzers = await db.query(`
      SELECT DISTINCT analyzer_name
      FROM task_analyzers
      ORDER BY analyzer_name
    `);
    console.log(`\n📋 task_analyzers table (${taskAnalyzers.rows.length} unique analyzers):`);
    taskAnalyzers.rows.forEach(row => {
      console.log(`  - ${row.analyzer_name}`);
    });

    // Check for analyzers with options
    console.log('\n\n🔧 Analyzers with Configuration Options:');
    const withOptions = await db.query(`
      SELECT
        ia.analyzer_name,
        ia.integration_name,
        ia.analyzer_options,
        a.display_name
      FROM integration_analyzers ia
      LEFT JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
      WHERE ia.analyzer_options IS NOT NULL AND ia.analyzer_options::text != '{}'
      ORDER BY ia.analyzer_name
    `);

    withOptions.rows.forEach(row => {
      console.log(`\n${row.analyzer_name} (${row.display_name || 'N/A'}) - ${row.integration_name}:`);
      console.log(JSON.stringify(row.analyzer_options, null, 2));
    });

    // Compare expected vs actual analyzers
    const expectedAnalyzers = [
      'UrlEntropyAnalyzer',
      'SpfAnalyzer',
      'DkimAnalyzer',
      'SenderReputationAnalyzer',
      'LinkReputationAnalyzer',
      'AttachmentAnalyzer',
      'ContentAnalysisAnalyzer',
      'buttonAnalyzer',
      'imageAnalyzer',
      'qrcodeAnalyzer',
      'RedirectAnalyzer',
      'FormAnalyzer'
    ];

    console.log('\n\n📊 Expected vs Actual Analyzers:');
    const allAnalyzersInDb = new Set([
      ...analyzersTable.rows.map(r => r.analyzer_name),
      ...integrationAnalyzers.rows.map(r => r.analyzer_name),
      ...taskAnalyzers.rows.map(r => r.analyzer_name)
    ]);

    expectedAnalyzers.forEach(expected => {
      const lowerExpected = expected.toLowerCase();
      const found = Array.from(allAnalyzersInDb).find(a => a.toLowerCase() === lowerExpected);
      if (found) {
        console.log(`  ✅ ${expected} → Found as: ${found}`);
      } else {
        console.log(`  ❌ ${expected} → NOT FOUND`);
      }
    });

  } finally {
    await db.end();
  }
}

checkAllAnalyzers();
