/**
 * PhishLogic - Phishing Detection System
 * Main entry point
 */

import { startServer } from './api/server.js';
import { getLogger } from './infrastructure/logging/index.js';

const logger = getLogger();

logger.info('Starting PhishLogic...');

// Start server
startServer().catch((error) => {
  logger.error({
    msg: 'Fatal error during startup',
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
