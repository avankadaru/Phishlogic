/**
 * SCIM Controller
 * HTTP handlers for SCIM 2.0 endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getScimService } from '../../core/services/scim.service.js';
import { getLogger } from '../../infrastructure/logging/logger.js';
import {
  ScimUserSchema,
  ScimGroupSchema,
  ScimPatchRequestSchema,
  ScimQueryParamsSchema,
  createScimError,
  parseETag,
  type ScimServiceProviderConfig,
} from '../schemas/scim.schema.js';
import { ZodError } from 'zod';

const logger = getLogger();

// ============================================================================
// SERVICE PROVIDER CONFIG
// ============================================================================

export async function getServiceProviderConfig(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const baseUrl = process.env['API_BASE_URL'] || `http://${request.hostname}:${process.env['PORT'] || 3000}`;

  const config: ScimServiceProviderConfig = {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: `${baseUrl}/docs/scim`,
    patch: {
      supported: true,
    },
    bulk: {
      supported: false,
    },
    filter: {
      supported: true,
      maxResults: 1000,
    },
    changePassword: {
      supported: false,
    },
    sort: {
      supported: false,
    },
    etag: {
      supported: true,
    },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication scheme using the OAuth Bearer Token standard',
        specUri: 'https://www.rfc-editor.org/rfc/rfc6750.html',
        primary: true,
      },
    ],
    meta: {
      resourceType: 'ServiceProviderConfig',
      location: `${baseUrl}/scim/v2/ServiceProviderConfig`,
    },
  };

  reply.status(200).send(config);
}

export async function getSchemas(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const schemas = {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    Resources: [
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:User',
        name: 'User',
        description: 'User Account',
      },
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        name: 'Group',
        description: 'Group',
      },
    ],
  };

  reply.status(200).send(schemas);
}

export async function getResourceTypes(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const baseUrl = process.env['API_BASE_URL'] || `http://${request.hostname}:${process.env['PORT'] || 3000}`;

  const resourceTypes = {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    Resources: [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/scim/v2/Users',
        description: 'User Account',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        meta: {
          resourceType: 'ResourceType',
          location: `${baseUrl}/scim/v2/ResourceTypes/User`,
        },
      },
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'Group',
        name: 'Group',
        endpoint: '/scim/v2/Groups',
        description: 'Group',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        meta: {
          resourceType: 'ResourceType',
          location: `${baseUrl}/scim/v2/ResourceTypes/Group`,
        },
      },
    ],
  };

  reply.status(200).send(resourceTypes);
}

// ============================================================================
// USER ENDPOINTS
// ============================================================================

export async function createUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const scimUser = ScimUserSchema.parse(request.body);
    const scimService = getScimService();

    const createdUser = await scimService.createUser(
      scimUser,
      request.scimOrganization.id
    );

    reply.status(201).send(createdUser);
  } catch (error) {
    handleScimError(error, reply, 'createUser');
  }
}

export async function getUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const scimService = getScimService();
    const user = await scimService.getUser(request.params.id, request.scimOrganization.id);

    if (!user) {
      return reply.status(404).send(
        createScimError(404, `User ${request.params.id} not found`, 'noTarget')
      );
    }

    reply.status(200).send(user);
  } catch (error) {
    handleScimError(error, reply, 'getUser');
  }
}

export async function listUsers(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const queryParams = ScimQueryParamsSchema.parse(request.query);
    const scimService = getScimService();

    const result = await scimService.listUsers(
      request.scimOrganization.id,
      queryParams.filter,
      queryParams.startIndex,
      queryParams.count
    );

    reply.status(200).send(result);
  } catch (error) {
    handleScimError(error, reply, 'listUsers');
  }
}

export async function updateUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    // Validate ETag if provided
    const ifMatch = request.headers['if-match'];
    if (ifMatch) {
      const version = parseETag(ifMatch);
      if (!version) {
        return reply.status(400).send(
          createScimError(400, 'Invalid If-Match header format', 'invalidValue')
        );
      }
    }

    const scimUser = ScimUserSchema.parse(request.body);
    const scimService = getScimService();

    const updatedUser = await scimService.updateUser(
      request.params.id,
      scimUser,
      request.scimOrganization.id
    );

    reply.status(200).send(updatedUser);
  } catch (error) {
    handleScimError(error, reply, 'updateUser');
  }
}

export async function patchUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const patchRequest = ScimPatchRequestSchema.parse(request.body);
    const scimService = getScimService();

    const updatedUser = await scimService.patchUser(
      request.params.id,
      patchRequest.Operations,
      request.scimOrganization.id
    );

    reply.status(200).send(updatedUser);
  } catch (error) {
    handleScimError(error, reply, 'patchUser');
  }
}

export async function deleteUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const scimService = getScimService();
    await scimService.deleteUser(request.params.id, request.scimOrganization.id);

    reply.status(204).send();
  } catch (error) {
    handleScimError(error, reply, 'deleteUser');
  }
}

// ============================================================================
// GROUP ENDPOINTS
// ============================================================================

export async function createGroup(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const scimGroup = ScimGroupSchema.parse(request.body);
    const scimService = getScimService();

    const createdGroup = await scimService.createGroup(
      scimGroup,
      request.scimOrganization.id
    );

    reply.status(201).send(createdGroup);
  } catch (error) {
    handleScimError(error, reply, 'createGroup');
  }
}

export async function getGroup(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const scimService = getScimService();
    const group = await scimService.getGroup(request.params.id, request.scimOrganization.id);

    if (!group) {
      return reply.status(404).send(
        createScimError(404, `Group ${request.params.id} not found`, 'noTarget')
      );
    }

    reply.status(200).send(group);
  } catch (error) {
    handleScimError(error, reply, 'getGroup');
  }
}

export async function listGroups(
  request: FastifyRequest<{ Querystring: Record<string, string> }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const queryParams = ScimQueryParamsSchema.parse(request.query);
    const scimService = getScimService();

    const result = await scimService.listGroups(
      request.scimOrganization.id,
      queryParams.filter,
      queryParams.startIndex,
      queryParams.count
    );

    reply.status(200).send(result);
  } catch (error) {
    handleScimError(error, reply, 'listGroups');
  }
}

export async function patchGroup(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const patchRequest = ScimPatchRequestSchema.parse(request.body);
    const scimService = getScimService();

    const updatedGroup = await scimService.patchGroup(
      request.params.id,
      patchRequest.Operations,
      request.scimOrganization.id
    );

    reply.status(200).send(updatedGroup);
  } catch (error) {
    handleScimError(error, reply, 'patchGroup');
  }
}

export async function deleteGroup(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
): Promise<void> {
  if (!request.scimOrganization) {
    return reply.status(401).send(createScimError(401, 'Organization context required'));
  }

  try {
    const scimService = getScimService();
    await scimService.deleteGroup(request.params.id, request.scimOrganization.id);

    reply.status(204).send();
  } catch (error) {
    handleScimError(error, reply, 'deleteGroup');
  }
}

// ============================================================================
// ERROR HANDLER
// ============================================================================

function handleScimError(error: unknown, reply: FastifyReply, operation: string): void {
  if (error instanceof ZodError) {
    logger.warn({
      operation,
      errors: error.errors,
      msg: 'SCIM validation error',
    });
    reply.status(400).send(
      createScimError(400, `Validation error: ${error.errors[0]?.message}`, 'invalidValue')
    );
    return;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('not found')) {
      reply.status(404).send(createScimError(404, error.message, 'noTarget'));
      return;
    }

    if (message.includes('already exists') || message.includes('duplicate')) {
      reply.status(409).send(createScimError(409, error.message, 'uniqueness'));
      return;
    }

    logger.error({
      operation,
      error: error.message,
      stack: error.stack,
      msg: 'SCIM operation error',
    });

    reply.status(500).send(createScimError(500, 'Internal server error'));
    return;
  }

  logger.error({
    operation,
    error: String(error),
    msg: 'Unknown SCIM error',
  });

  reply.status(500).send(createScimError(500, 'Internal server error'));
}
