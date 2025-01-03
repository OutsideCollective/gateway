import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { Chain } from '../services/common-interfaces';
import { ConfigManagerV2 } from '../services/config-manager-v2';
import { getInitializedChain } from '../services/connection-manager';
import {
  AllowancesRequest,
  AllowancesResponse,
  NonceRequest,
  NonceResponse,
  CancelRequest,
  CancelResponse,
  ApproveRequest,
  ApproveResponse,
} from './chain.requests';
import {
  StatusRequest,
  BalanceRequest,
  PollRequest,
  TokensRequest,
} from '../network/network.requests';
import { TransferRequest } from '../services/common-interfaces';
import {
  allowances,
  approve,
  balances,
  cancel,
  getTokens,
  nextNonce,
  nonce,
  poll,
  transfer,
} from './chain.controller';
import { getStatus } from '../network/network.controllers';
import { validateNonceRequest } from './ethereum/ethereum.validators';
import {
  mkRequestValidator,
  RequestValidator,
  validateTxHash,
} from '../services/validators';
import {
  validateChain as validateEthereumChain,
  validateNetwork as validateEthereumNetwork,
} from '../chains/ethereum/ethereum.validators';

export const validatePollRequest: RequestValidator = mkRequestValidator([
  validateTxHash,
]);

export const validateTokensRequest: RequestValidator = mkRequestValidator([
  validateEthereumChain,
  validateEthereumNetwork,
]);

export const chainRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /status
  fastify.get<{ Querystring: StatusRequest }>(
    '/status',
    {
      schema: {
        querystring: Type.Object({
          chain: Type.Optional(Type.String()),
          network: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      return await getStatus(request.query);
    }
  );

  // GET /config
  fastify.get('/config', async () => {
    return ConfigManagerV2.getInstance().allConfigurations;
  });

  // POST /balances
  fastify.post<{ Body: BalanceRequest }>(
    '/balances',
    async (request) => {
      const chain = await getInitializedChain<Chain>(
        request.body.chain,
        request.body.network
      );
      return await balances(chain, request.body);
    }
  );

  // POST /poll
  fastify.post<{ Body: PollRequest }>(
    '/poll',
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await poll(chain, request.body);
    }
  );

  // GET /tokens
  fastify.get<{ Querystring: TokensRequest }>(
    '/tokens',
    async (request) => {
      const chain = await getInitializedChain(
        request.query.chain,
        request.query.network
      );
      return await getTokens(chain, request.query);
    }
  );

  // POST /nextNonce
  fastify.post<{ Body: NonceRequest }>(
    '/nextNonce',
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await nextNonce(chain, request.body);
    }
  );

  // POST /nonce
  fastify.post<{ Body: NonceRequest; Reply: NonceResponse }>(
    '/nonce',
    async (request) => {
      validateNonceRequest(request.body);
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await nonce(chain, request.body);
    }
  );

  // POST /allowances
  fastify.post<{ Body: AllowancesRequest; Reply: AllowancesResponse }>(
    '/allowances',
    {
      schema: {
        response: {
          200: Type.Object({
            network: Type.String(),
            timestamp: Type.Number(),
            latency: Type.Number(),
            spender: Type.String(),
            approvals: Type.Record(Type.String(), Type.String())
          })
        }
      }
    },
    async (request): Promise<AllowancesResponse> => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return (await allowances(chain, request.body)) as AllowancesResponse;
    }
  );

  // POST /approve
  fastify.post<{ Body: ApproveRequest; Reply: ApproveResponse }>(
    '/approve',
    {
      schema: {
        response: {
          200: Type.Object({
            network: Type.String(),
            timestamp: Type.Number(),
            latency: Type.Number(),
            tokenAddress: Type.String(),
            spender: Type.String(),
            amount: Type.String(),
            nonce: Type.Number(),
            approval: Type.Object({
              // Add CustomTransaction properties here
              // Example:
              data: Type.String(),
              to: Type.String(),
              // ... other properties
            })
          })
        }
      }
    },
    async (request): Promise<ApproveResponse> => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return (await approve(chain, request.body)) as ApproveResponse;
    }
  );

  // POST /cancel
  fastify.post<{ Body: CancelRequest; Reply: CancelResponse }>(
    '/cancel',
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await cancel(chain, request.body);
    }
  );

  // POST /transfer
  fastify.post<{ Body: TransferRequest }>(
    '/transfer',
    async (request) => {
      const chain = await getInitializedChain(
        request.body.chain,
        request.body.network
      );
      return await transfer(chain, request.body);
    }
  );
};

export default chainRoutes;
