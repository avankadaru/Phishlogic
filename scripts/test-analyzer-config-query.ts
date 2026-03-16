import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function testAnalyzerConfig() {
  const db = getDatabaseClient();

  try {
    console.log('🧪 Testing analyzer configuration query...\n');

    const integrationName = 'chrome';

    // Test the getIntegrationAnalyzers query
    const analyzersResult = await db.query(`
      SELECT
        ia.analyzer_name as "analyzerName",
        ia.execution_order as "executionOrder",
        ia.analyzer_options as "analyzerOptions",
        a.display_name as "displayName",
        a.description,
        a.analyzer_type as "analyzerType",
        a.is_active as "isActive",
        ta.task_name as "taskName",
        ta.is_long_running as "isLongRunning",
        ta.estimated_duration_ms as "estimatedDurationMs",
        t.display_name as "taskDisplayName",
        t.description as "taskDescription"
      FROM integration_analyzers ia
      LEFT JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
      LEFT JOIN task_analyzers ta ON ia.analyzer_name = ta.analyzer_name
      LEFT JOIN tasks t ON ta.task_name = t.task_name
      WHERE ia.integration_name = $1
      ORDER BY ta.execution_order ASC, ia.execution_order ASC, ia.analyzer_name ASC
    `, [integrationName]);

    console.log(`✅ Found ${analyzersResult.rows.length} analyzers for ${integrationName}\n`);

    analyzersResult.rows.forEach((analyzer, index) => {
      console.log(`${index + 1}. ${analyzer.displayName || analyzer.analyzerName}`);
      console.log(`   Analyzer Name: ${analyzer.analyzerName}`);
      console.log(`   Type: ${analyzer.analyzerType || 'N/A'}`);
      console.log(`   Execution Order: ${analyzer.executionOrder}`);
      console.log(`   Active: ${analyzer.isActive}`);
      if (analyzer.analyzerOptions) {
        console.log(`   Options:`, JSON.stringify(analyzer.analyzerOptions, null, 2));
      }
      console.log();
    });

    console.log('✅ Analyzer configuration query executed successfully!');

  } finally {
    await db.end();
  }
}

testAnalyzerConfig();
