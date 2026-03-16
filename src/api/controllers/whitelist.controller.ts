/**
 * Whitelist API controller
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AddWhitelistEntryRequest } from '../schemas/analysis.schema.js';
import { getWhitelistService } from '../../core/services/whitelist.service.js';
import { getLogger } from '../../infrastructure/logging/index.js';

const logger = getLogger();
const whitelistService = getWhitelistService();

/**
 * Get all whitelist entries
 */
export async function getWhitelistEntries(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const entries = await whitelistService.getAllEntries();

    return reply.status(200).send({
      entries,
      count: entries.length,
    });
  } catch (error) {
    logger.error({
      msg: 'Failed to get whitelist entries',
      error: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'Failed to get whitelist entries',
    });
  }
}

/**
 * Get whitelist entry by ID
 */
export async function getWhitelistEntry(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const entry = await whitelistService.getEntry(request.params.id);

    if (!entry) {
      return reply.status(404).send({
        error: 'Entry not found',
      });
    }

    return reply.status(200).send(entry);
  } catch (error) {
    logger.error({
      msg: 'Failed to get whitelist entry',
      error: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'Failed to get whitelist entry',
    });
  }
}

/**
 * Add whitelist entry
 */
export async function addWhitelistEntry(
  request: FastifyRequest<{ Body: AddWhitelistEntryRequest }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const entry = await whitelistService.addEntry(request.body);

    logger.info({
      msg: 'Whitelist entry added via API',
      entryId: entry.id,
      type: entry.type,
    });

    return reply.status(201).send(entry);
  } catch (error) {
    logger.error({
      msg: 'Failed to add whitelist entry',
      error: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'Failed to add whitelist entry',
    });
  }
}

/**
 * Delete whitelist entry
 */
export async function deleteWhitelistEntry(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const deleted = whitelistService.removeEntry(request.params.id);

    if (!deleted) {
      return reply.status(404).send({
        error: 'Entry not found',
      });
    }

    logger.info({
      msg: 'Whitelist entry deleted via API',
      entryId: request.params.id,
    });

    return reply.status(204).send();
  } catch (error) {
    logger.error({
      msg: 'Failed to delete whitelist entry',
      error: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'Failed to delete whitelist entry',
    });
  }
}

/**
 * Get whitelist statistics
 */
export async function getWhitelistStats(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const stats = whitelistService.getStats();

    return reply.status(200).send(stats);
  } catch (error) {
    logger.error({
      msg: 'Failed to get whitelist stats',
      error: error instanceof Error ? error.message : String(error),
    });

    return reply.status(500).send({
      error: 'Failed to get whitelist stats',
    });
  }
}
