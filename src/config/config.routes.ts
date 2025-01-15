import { FastifyPluginAsync } from 'fastify';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import {
  validateConfigUpdateRequest,
  updateAllowedSlippageToFraction,
} from './config.validators';
import { Type, Static } from '@sinclair/typebox';

// Define schemas inline
export const ConfigUpdateRequestSchema = Type.Object({
  configPath: Type.String({ description: 'Configuration path' }),
  configValue: Type.Union([
    Type.String(),
    Type.Number(),
    Type.Boolean(),
    Type.Object({}),
    Type.Array(Type.Any())
  ], { description: 'Configuration value' })
});

const ConfigUpdateResponseSchema = Type.Object({
  message: Type.String({ description: 'Status message' })
});

// TypeScript types
type ConfigUpdateRequest = Static<typeof ConfigUpdateRequestSchema>;
type ConfigUpdateResponse = Static<typeof ConfigUpdateResponseSchema>;

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /config - Get general or chain-specific configuration
  fastify.get('/', {
    schema: {
      description: 'Get configuration',
      tags: ['config'],
      querystring: Type.Object({
        chainOrConnector: Type.Optional(Type.String()),
      }),
    },
  }, async (request) => {
    const { chainOrConnector } = request.query as { chainOrConnector?: string };
    
    if (chainOrConnector) {
      const namespace = ConfigManagerV2.getInstance().getNamespace(chainOrConnector);
      return namespace ? namespace.configuration : {};
    }
    
    return ConfigManagerV2.getInstance().allConfigurations;
  });

  // POST /config/update - Update configuration
  fastify.post<{ Body: ConfigUpdateRequest; Reply: ConfigUpdateResponse }>(
    '/update',
    {
      schema: {
        description: 'Update configuration',
        tags: ['config'],
        body: ConfigUpdateRequestSchema,
        response: {
          200: ConfigUpdateResponseSchema,
        }
      }
    },
    async (request) => {
      validateConfigUpdateRequest(request.body);
      
      const config = ConfigManagerV2.getInstance().get(request.body.configPath);
      
      if (typeof request.body.configValue === 'string') {
        switch (typeof config) {
          case 'number':
            request.body.configValue = Number(request.body.configValue);
            break;
          case 'boolean':
            request.body.configValue =
              request.body.configValue.toLowerCase() === 'true';
            break;
        }
      }

      if (request.body.configPath.endsWith('allowedSlippage')) {
        updateAllowedSlippageToFraction(request.body);
      }

      ConfigManagerV2.getInstance().set(
        request.body.configPath,
        request.body.configValue
      );

      return { message: 'The config has been updated' };
    }
  );
};

export default configRoutes;
