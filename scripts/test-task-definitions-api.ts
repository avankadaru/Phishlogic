import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function testTaskDefinitionsAPI() {
  const db = getDatabaseClient();

  try {
    console.log('🔍 Testing Task Definitions API Data\n');

    // Simulate what the API endpoint returns
    const tasksResult = await db.query(`
      SELECT task_name, display_name, description, input_type, execution_order, is_active
      FROM tasks
      WHERE is_active = true
      ORDER BY execution_order
    `);

    console.log(`📋 ${tasksResult.rows.length} Active Tasks:\n`);

    let totalAnalyzers = 0;

    for (const task of tasksResult.rows) {
      console.log(`${task.execution_order}. ${task.display_name}`);
      console.log(`   Task Name: ${task.task_name}`);
      console.log(`   Description: ${task.description}`);

      // Get analyzers for this task
      const analyzersResult = await db.query(`
        SELECT
          ta.id,
          ta.analyzer_name,
          ta.execution_order,
          ta.is_long_running,
          ta.estimated_duration_ms,
          a.display_name as analyzer_display_name,
          a.description as analyzer_description,
          a.analyzer_type
        FROM task_analyzers ta
        LEFT JOIN analyzers a ON ta.analyzer_name = a.analyzer_name
        WHERE ta.task_name = $1
        ORDER BY ta.execution_order
      `, [task.task_name]);

      console.log(`   Analyzers: ${analyzersResult.rows.length}`);
      analyzersResult.rows.forEach((analyzer, index) => {
        console.log(`      ${index + 1}. ${analyzer.analyzer_display_name || analyzer.analyzer_name}`);
        if (analyzer.is_long_running) {
          console.log(`         ⏱️  Long Running (${analyzer.estimated_duration_ms}ms)`);
        }
      });
      console.log();

      totalAnalyzers += analyzersResult.rows.length;
    }

    console.log(`\n✅ Summary:`);
    console.log(`   ${tasksResult.rows.length} Tasks`);
    console.log(`   ${totalAnalyzers} Total Analyzers`);

  } finally {
    await db.end();
  }
}

testTaskDefinitionsAPI();
