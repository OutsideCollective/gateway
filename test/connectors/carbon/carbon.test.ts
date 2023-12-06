import request from 'supertest';
import { EncodedStrategy, TokenPair } from '@bancor/carbon-sdk';
import {
  buildStrategyObject,
  encodeStrategy,
} from '@bancor/carbon-sdk/strategy-management';
import { BigNumber } from '@bancor/carbon-sdk/utils';
import { gatewayApp } from '../../../src/app';
import { patch, unpatch } from '../../../test/services/patch';
import { Ethereum } from '../../../src/chains/ethereum/ethereum';
import { EVMTxBroadcaster } from '../../../src/chains/ethereum/evm.broadcaster';
import { CarbonCLOB } from '../../../src/connectors/carbon/carbon';
import { logger } from '../../../src/services/logger';
import { encodeStrategyId } from '../../../src/connectors/carbon/carbon.utils';
import { patchEVMNonceManager } from '../../../test/evm.nonce.mock';

let ethereum: Ethereum;
let carbon: CarbonCLOB;

const TX_HASH =
  '0xf6f81a37796bd06a797484467302e4d6f72832409545e2e01feb86dd8b22e4b2'; // noqa: mock
const MARKET = 'DAI-USDC';
const DEFAULT_FEE = 2000;
const NUM_ORDERBOOK_BUCKETS = 14;

const MARKETS = [
  {
    ticker: 'DAI-USDC',
    baseToken: {
      chainId: 1,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      name: 'Dai',
      symbol: 'DAI',
      decimals: 18,
      logoURI:
        'https://assets.coingecko.com/coins/images/9956/thumb/4943.png?1636636734',
    },
    quoteToken: {
      chainId: 1,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoURI:
        'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png?1547042389',
    },
    makerFee: 10,
  },
  {
    ticker: 'DAI-ETH',
    baseToken: {
      chainId: 1,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      name: 'Dai',
      symbol: 'DAI',
      decimals: 18,
      logoURI:
        'https://assets.coingecko.com/coins/images/9956/thumb/4943.png?1636636734',
    },
    quoteToken: {
      chainId: 1,
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    makerFee: 2000,
  },
];

const ORDERS = [
  {
    id: '729',
    pairId: '4',
    owner: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    baseToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    quoteToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    baseDecimals: 6,
    quoteDecimals: 18,
    buyPriceLow: '0.95',
    buyPriceMarginal: '0.98',
    buyPriceHigh: '0.98',
    buyBudget: '1000',
    sellPriceLow: '1.03',
    sellPriceMarginal: '1.035',
    sellPriceHigh: '1.04',
    sellBudget: '1000',
  },
  {
    id: '730',
    pairId: '4',
    owner: '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
    baseToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    quoteToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    baseDecimals: 6,
    quoteDecimals: 18,
    buyPriceLow: '0.90',
    buyPriceMarginal: '0.95',
    buyPriceHigh: '0.95',
    buyBudget: '2000',
    sellPriceLow: '1.03',
    sellPriceMarginal: '1.05',
    sellPriceHigh: '1.05',
    sellBudget: '2000',
  },
  {
    id: '731',
    pairId: '1',
    owner: '0x7e57780cf01209a1522b9dCeFa9ff191DDd1c70f',
    baseToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    quoteToken: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    baseDecimals: 18,
    quoteDecimals: 18,
    buyPriceLow: '1500',
    buyPriceMarginal: '1900',
    buyPriceHigh: '1900',
    buyBudget: '1000',
    sellPriceLow: '2200',
    sellPriceMarginal: '2400',
    sellPriceHigh: '2400',
    sellBudget: '1000',
  },
];

const GAS_PRICES = {
  gasPrice: '500000000',
  gasPriceToken: 'ETH',
  gasLimit: '1000',
  gasCost: '100',
};

const INVALID_REQUEST = {
  chain: 'unknown',
  connector: 'carbon',
};

const TOKENS = [
  {
    chainId: 1,
    name: 'USD Coin',
    symbol: 'USDC',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
  },
  {
    chainId: 1,
    name: 'DAI',
    symbol: 'DAI',
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    decimals: 18,
  },
  {
    chainId: 1,
    name: 'ETH',
    symbol: 'Ethereum',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
  },
];

beforeAll(async () => {
  ethereum = Ethereum.getInstance('mainnet');
  patchEVMNonceManager(ethereum.nonceManager);
  ethereum.init();
  carbon = CarbonCLOB.getInstance('ethereum', 'mainnet');
  patchReader();

  await carbon.init();
});

beforeEach(() => {
  patchReader();
});

afterEach(() => {
  unpatch();
});

afterAll(async () => {
  await ethereum.close();
});

const buildEncodedStrategy = (order: {
  id: string;
  pairId: string;
  baseToken: string;
  quoteToken: string;
  baseDecimals: number;
  quoteDecimals: number;
  buyPriceLow: string;
  buyPriceHigh: string;
  buyBudget: string;
  sellPriceLow: string;
  sellPriceHigh: string;
  sellBudget: string;
}) => {
  const strategyObject = buildStrategyObject(
    order.baseToken,
    order.quoteToken,
    order.baseDecimals,
    order.quoteDecimals,
    order.buyPriceLow,
    order.buyPriceHigh,
    order.buyPriceHigh,
    order.buyBudget,
    order.sellPriceLow,
    order.sellPriceHigh,
    order.sellPriceHigh,
    order.sellBudget
  );

  return {
    id: BigNumber.from(encodeStrategyId(order.id, order.pairId)),
    ...encodeStrategy(strategyObject),
  };
};

const patchReader = () => {
  patch(carbon.api.reader, 'tokensByOwner', (owner: string): BigNumber[] => {
    const ownerOrders = ORDERS.filter((order) => owner === order.owner);
    if (!owner || ownerOrders.length === 0) return [];
    return ownerOrders.map((order) =>
      BigNumber.from(encodeStrategyId(order.id, order.pairId))
    );
  });

  patch(carbon.api.reader, 'pairs', (): TokenPair[] => {
    return MARKETS.map((market) => [
      market.baseToken.address,
      market.quoteToken.address,
    ]);
  });

  patch(
    carbon.api.reader,
    'strategiesByPair',
    (token0: string, token1: string): EncodedStrategy[] => {
      return ORDERS.filter((order) => {
        return (
          (order.baseToken === token0 && order.quoteToken === token1) ||
          (order.baseToken === token1 && order.quoteToken === token0)
        );
      }).map(buildEncodedStrategy);
    }
  );

  patch(
    carbon.api.reader,
    'strategies',
    (ids: BigNumber[]): EncodedStrategy[] => {
      return ORDERS.filter((order) => {
        return ids.includes(
          BigNumber.from(encodeStrategyId(order.id, order.pairId))
        );
      }).map(buildEncodedStrategy);
    }
  );

  patch(carbon.api.reader, 'strategy', (id: BigNumber): EncodedStrategy => {
    const order = ORDERS.find((order) => {
      return encodeStrategyId(order.id, order.pairId) === id.toString();
    });
    if (!order) throw Error('No strategy found');

    return buildEncodedStrategy(order);
  });

  patch(carbon.api.reader, 'tradingFeePPM', (): number => {
    return DEFAULT_FEE;
  });

  patch(
    carbon.api.reader,
    'pairsTradingFeePPM',
    (pairs: TokenPair[]): [string, string, number][] => {
      return pairs.map((pair) => {
        const market = MARKETS.filter((market) => 'makerFee' in market).find(
          (market) => {
            return (
              (market.baseToken.address.toLowerCase() ===
                pair[0].toLowerCase() &&
                market.quoteToken.address.toLowerCase() ===
                  pair[1].toLowerCase()) ||
              (market.baseToken.address.toLowerCase() ===
                pair[1].toLowerCase() &&
                market.quoteToken.address.toLowerCase() ===
                  pair[0].toLowerCase())
            );
          }
        );
        return [pair[0], pair[1], market?.makerFee || DEFAULT_FEE];
      });
    }
  );
  patch(
    carbon.api.reader,
    'getLatestStrategyCreatedStrategies',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );

  patch(
    carbon.api.reader,
    'getLatestStrategyDeletedStrategies',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );

  patch(
    carbon.api.reader,
    'getLatestTokensTradedTrades',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );

  patch(
    carbon.api.reader,
    'getLatestTradingFeeUpdates',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );
  patch(
    carbon.api.reader,
    'getLatestPairTradingFeeUpdates',
    (fromBlock: number, toBlock: number) => {
      logger.info(`${fromBlock} ${toBlock}`);
      return [];
    }
  );
};

const patchGasPrices = () => {
  patch(carbon, 'estimateGas', () => {
    return GAS_PRICES;
  });
};

const patchGetWallet = () => {
  patch(ethereum, 'getWallet', () => {
    return {
      privateKey:
        '83d8fae2444141a142079e9aa6dc1a49962af114d9ace8db9a34ecb8fa3e6cf8', // noqa: mock
      address: '0x7e57780cf01209a1522b9dCeFa9ff191DDd1c70f',
    };
  });
};

const patchGetTokenBySymbol = () => {
  patch(ethereum, 'getTokenBySymbol', (symbol: string) => {
    return TOKENS.find(
      (token) => token.symbol.toUpperCase() === symbol.toUpperCase()
    );
  });
};

const patchMsgBroadcaster = () => {
  patch(EVMTxBroadcaster, 'getInstance', () => {
    return {
      broadcast() {
        return {
          hash: TX_HASH,
        };
      },
    };
  });
};

describe('GET /clob/markets', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbon',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        expect(res.body.markets.length).toEqual(2);
      });
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/markets`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/orderBook', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbon',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) =>
        expect(res.body.buys.length).toEqual(NUM_ORDERBOOK_BUCKETS)
      )
      .expect((res) =>
        expect(res.body.sells.length).toEqual(NUM_ORDERBOOK_BUCKETS)
      )
      .expect((res) => expect(Number(res.body.buys[0].price)).toBeLessThan(1))
      .expect((res) =>
        expect(Number(res.body.sells[0].price)).toBeGreaterThan(1)
      );
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orderBook`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/ticker', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbon',
        market: MARKET,
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) =>
        expect(res.body.markets.baseToken.symbol).toEqual(MARKET.split('-')[0])
      )
      .expect((res) =>
        expect(res.body.markets.quoteToken.symbol).toEqual(MARKET.split('-')[1])
      );
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/ticker`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbon',
        orderId: '731',
        address: '0x7e57780cf01209a1522b9dCeFa9ff191DDd1c70f', // noqa: mock
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.orders.length).toEqual(1));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/orders`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});

describe('POST /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchGetWallet();
    patchGetTokenBySymbol();
    patchMsgBroadcaster();
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbon',
        address: '0x7e57780cf01209a1522b9dCeFa9ff191DDd1c70f', // noqa: mock
        market: MARKET,
        price: '10000.12',
        amount: '0.12',
        side: 'BUY',
        orderType: 'LIMIT_MAKER',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toBeTruthy());
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .post(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('DELETE /clob/orders', () => {
  it('should return 200 with proper request', async () => {
    patchGetWallet();
    patchGetTokenBySymbol();
    patchMsgBroadcaster();
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbon',
        address: '0x7e57780cf01209a1522b9dCeFa9ff191DDd1c70f', // noqa: mock
        orderId: '731',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.txHash).toBeTruthy());
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .delete(`/clob/orders`)
      .send(INVALID_REQUEST)
      .expect(404);
  });
});

describe('GET /clob/estimateGas', () => {
  it('should return 200 with proper request', async () => {
    patchGasPrices();
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query({
        chain: 'ethereum',
        network: 'mainnet',
        connector: 'carbon',
      })
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => expect(res.body.gasPrice).toEqual(GAS_PRICES.gasPrice));
  });

  it('should return 404 when parameters are invalid', async () => {
    await request(gatewayApp)
      .get(`/clob/estimateGas`)
      .query(INVALID_REQUEST)
      .expect(404);
  });
});
