import { getDatabaseClient } from '../src/infrastructure/database/client.js';

async function checkTaskAnalyzerDetails() {
  const db = getDatabaseClient();

  try {
    console.log('🔍 Task-Analyzer Detailed Structure\n');

    // Get all tasks with their analyzers
    const tasks = await db.query(`
      SELECT task_name, display_name, description, input_type, execution_order
      FROM tasks
      WHERE is_active = true
      ORDER BY execution_order
    `);

    console.log(`📋 ${tasks.rows.length} Active Tasks:\n`);

    for (const task of tasks.rows) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📦 ${task.display_name} (${task.task_name})`);
      console.log(`   ${task.description || 'No description'}`);
      console.log(`${'='.repeat(70)}`);

      // Get analyzers for this task
      const analyzers = await db.query(`
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

      if (analyzers.rows.length === 0) {
        console.log('   ⚠️  No analyzers assigned');
      } else {
        console.log(`\n   ⚙️  ${analyzers.rows.length} Analyzers:\n`);
        analyzers.rows.forEach((analyzer, index) => {
          console.log(`   ${index + 1}. ${analyzer.analyzer_display_name || analyzer.analyzer_name}`);
          console.log(`      Name: ${analyzer.analyzer_name}`);
          console.log(`      Order: ${analyzer.execution_order}`);
          console.log(`      Long Running: ${analyzer.is_long_running || false}`);
          if (analyzer.estimated_duration_ms) {
            console.log(`      Est. Duration: ${analyzer.estimated_duration_ms}ms`);
          }
          if (!analyzer.analyzer_display_name) {
            console.log(`      ❌ MISSING in analyzers table`);
          }
        });
      }
    }

    // Summary of missing analyzers
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('📊 Summary: Analyzers Missing from analyzers table');
    console.log(`${'='.repeat(70)}\n`);

    const missingAnalyzers = await db.query(`
      SELECT DISTINCT ta.analyzer_name
      FROM task_analyzers ta
      LEFT JOIN analyzers a ON ta.analyzer_name = a.analyzer_name
      WHERE a.analyzer_name IS NULL
      ORDER BY ta.analyzer_name
    `);

    if (missingAnalyzers.rows.length === 0) {
      console.log('✅ All analyzers have entries in analyzers table');
    } else {
      console.log(`❌ ${missingAnalyzers.rows.length} analyzers need to be added to analyzers table:\n`);
      missingAnalyzers.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.analyzer_name}`);
      });
    }

  } finally {
    await db.end();
  }
}

checkTaskAnalyzerDetails();
