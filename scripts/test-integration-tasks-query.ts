import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function testQuery() {
  const db = getDatabaseClient();

  try {
    // Test the fixed query
    console.log('🧪 Testing integration tasks query...\n');

    const integrationsResult = await db.query(`
      SELECT
        it.id,
        it.integration_name as "integrationName",
        it.display_name as "displayName",
        it.description,
        it.input_type as "inputType",
        it.enabled,
        it.execution_mode as "executionMode",
        it.ai_model_id as "aiModelId",
        it.fallback_to_native as "fallbackToNative",
        it.created_at as "createdAt",
        it.updated_at as "updatedAt"
      FROM integration_tasks it
      WHERE it.deleted_at IS NULL
      ORDER BY it.integration_name ASC
    `);

    console.log(`✅ Found ${integrationsResult.rows.length} integration tasks\n`);

    for (const integration of integrationsResult.rows) {
      console.log(`📦 ${integration.displayName} (${integration.integrationName})`);
      console.log(`   Mode: ${integration.executionMode}, Enabled: ${integration.enabled}`);

      // Test the analyzer query for this integration
      const analyzersResult = await db.query(`
        SELECT
          a.analyzer_name as "taskName",
          a.display_name as "displayName",
          a.description,
          a.analyzer_type as "analyzerGroup",
          a.is_active as "isActive",
          ia.execution_order as "executionOrder"
        FROM integration_analyzers ia
        JOIN analyzers a ON ia.analyzer_name = a.analyzer_name
        WHERE ia.integration_name = $1
        ORDER BY ia.execution_order ASC
      `, [integration.integrationName]);

      console.log(`   ⚙️  ${analyzersResult.rows.length} analyzers configured:`);
      analyzersResult.rows.forEach(analyzer => {
        console.log(`      - ${analyzer.displayName} (order: ${analyzer.executionOrder})`);
      });
      console.log();
    }

    console.log('✅ All queries executed successfully!');

  } finally {
    await db.end();
  }
}

testQuery();
