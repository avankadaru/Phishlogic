import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function checkTasksStructure() {
  const db = getDatabaseClient();

  try {
    console.log('🔍 Checking Tasks and Analyzers Structure\n');

    // Get all tasks
    const tasksResult = await db.query(`
      SELECT task_name, display_name, description, input_type, execution_order, is_active
      FROM tasks
      ORDER BY execution_order, task_name
    `);

    console.log(`📋 Tasks (${tasksResult.rows.length} total):`);
    tasksResult.rows.forEach((task, index) => {
      console.log(`${index + 1}. ${task.display_name} (${task.task_name})`);
      console.log(`   Input: ${task.input_type}, Order: ${task.execution_order}, Active: ${task.is_active}`);
    });

    // Get all analyzers
    const analyzersResult = await db.query(`
      SELECT analyzer_name, display_name, description, analyzer_type, is_active
      FROM analyzers
      ORDER BY analyzer_name
    `);

    console.log(`\n⚙️  Analyzers (${analyzersResult.rows.length} total):`);
    analyzersResult.rows.forEach((analyzer, index) => {
      console.log(`${index + 1}. ${analyzer.display_name} (${analyzer.analyzer_name})`);
      console.log(`   Type: ${analyzer.analyzer_type}, Active: ${analyzer.is_active}`);
    });

    // Get task-analyzer mappings
    console.log('\n🔗 Task-Analyzer Mappings:');
    for (const task of tasksResult.rows) {
      const mappingsResult = await db.query(`
        SELECT
          ta.analyzer_name,
          a.display_name,
          ta.execution_order,
          ta.is_long_running,
          ta.estimated_duration_ms
        FROM task_analyzers ta
        JOIN analyzers a ON ta.analyzer_name = a.analyzer_name
        WHERE ta.task_name = $1
        ORDER BY ta.execution_order
      `, [task.task_name]);

      if (mappingsResult.rows.length > 0) {
        console.log(`\n📦 ${task.display_name} (${mappingsResult.rows.length} analyzers):`);
        mappingsResult.rows.forEach(mapping => {
          console.log(`   ${mapping.execution_order}. ${mapping.display_name}`);
        });
      }
    }

    // Check analyzer options structure
    console.log('\n\n🔧 Sample Analyzer Options from integration_analyzers:');
    const optionsResult = await db.query(`
      SELECT
        analyzer_name,
        analyzer_options
      FROM integration_analyzers
      WHERE analyzer_options IS NOT NULL AND analyzer_options::text != '{}'
      LIMIT 5
    `);

    optionsResult.rows.forEach(row => {
      console.log(`\n${row.analyzer_name}:`);
      console.log(JSON.stringify(row.analyzer_options, null, 2));
    });

  } finally {
    await db.end();
  }
}

checkTasksStructure();
