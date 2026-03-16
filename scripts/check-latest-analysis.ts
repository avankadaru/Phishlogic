#!/usr/bin/env tsx

/**
 * Check latest analysis execution steps
 */

import { initDatabase, closeDatabase } from '../src/infrastructure/database/client.js';
import { getLogger } from '../src/infrastructure/logging/logger.js';

const logger = getLogger();

async function checkLatestAnalysis() {
  try {
    const pool = initDatabase();

    // Get latest analysis
    const result = await pool.query(`
      SELECT
        id,
        verdict,
        score,
        execution_mode,
        integration_name,
        execution_steps,
        analyzers_run,
        created_at
      FROM analyses
      WHERE integration_name = 'gmail'
      ORDER BY created_at DESC
      LIMIT 1;
    `);

    if (result.rows.length === 0) {
      console.log('No analyses found');
      await closeDatabase();
      process.exit(1);
    }

    const analysis = result.rows[0];

    console.log('\n=== Latest Gmail Analysis ===\n');
    console.log(`ID: ${analysis.id}`);
    console.log(`Verdict: ${analysis.verdict}`);
    console.log(`Score: ${analysis.score}`);
    console.log(`Execution Mode: ${analysis.execution_mode}`);
    console.log(`Integration: ${analysis.integration_name}`);
    console.log(`Created: ${analysis.created_at}`);

    console.log('\n=== Analyzers Run ===\n');
    console.log(analysis.analyzers_run || 'None');

    console.log('\n=== Execution Steps ===\n');
    const steps = analysis.execution_steps || [];
    steps.forEach((step: any, index: number) => {
      const duration = step.duration !== undefined ? `${step.duration}ms` : 'N/A';
      const status = step.status || 'unknown';
      console.log(`${index + 1}. ${step.step} [${status}] - ${duration}`);
      if (step.context) {
        console.log(`   Context:`, JSON.stringify(step.context, null, 2));
      }
      if (step.error) {
        console.log(`   Error: ${step.error}`);
      }
    });

    await closeDatabase();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '❌ Failed to check latest analysis');
    await closeDatabase();
    process.exit(1);
  }
}

checkLatestAnalysis();
