
//  ---------------------------------------------------------------------------
import Exchange from './abstract/bingx.js';
import { AuthenticationError, ExchangeNotAvailable, AccountSuspended, PermissionDenied, RateLimitExceeded, InvalidNonce, InvalidAddress, ArgumentsRequired, ExchangeError, InvalidOrder, InsufficientFunds, BadRequest, OrderNotFound, BadSymbol, NotSupported } from './base/errors.js';
import { Precise } from './base/Precise.js';
import { sha256 } from './static_dependencies/noble-hashes/sha256.js';
import { TICK_SIZE, TRUNCATE } from './base/functions/number.js';
import { Int } from './base/types.js';

//  ---------------------------------------------------------------------------

export default class bingx extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'bingx',
            'name': 'BingX',
            'countries': [ 'US' ], // North America, Canada, the EU, Hong Kong and Taiwan
            // 150 per 5 seconds = 30 per second
            // rateLimit = 1000ms / 30 ~= 33.334
            'rateLimit': 100,
            'version': 'v1',
            'certified': true,
            'pro': true,
            'has': {
                'CORS': undefined,
                'spot': true,
                'margin': true,
                'swap': undefined, // has but unimplemented
                'future': false,
                'option': undefined,
                'fetchMarkets': true,
                'fetchOHLCV': true,
            },
            'hostname': 'bingx.com',
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/129991357-8f47464b-d0f4-41d6-8a82-34122f0d1398.jpg',
                'api': {
                    'spot': 'https://open-api.bingx.com/openApi/spot',
                    'swap': 'https://open-api.bingx.com/openApi/swap',
                    'contract': 'https://open-api.bingx.com/openApi/contract',
                },
                'www': '',
                'doc': '',
                'referral': {
                    'url': 'http://www.bitmart.com/?r=rQCFLh',
                    'discount': 0.3,
                },
                'fees': '',
            },
            'requiredCredentials': {
                'apiKey': true,
                'secret': true,
            },
            'api': {
                'spot': {
                    'v1': {
                        'public': {
                            'get': {
                                'common/symbols': 1,
                                'market/trades': 1,
                                'market/depth': 1,
                                'market/getLatestKline': 1,
                            },
                        },
                        'private': {
                            'get': {
                            },
                            'post': {
                            },
                        },
                    },
                },
                'swap': {
                    'v2': {
                        'public': {
                            'get': {
                                'server/time': 1,
                                'quote/contracts': 1,
                                'quote/price': 1,
                                'quote/depth': 1,
                                'quote/trades': 1,
                                'quote/premiumIndex': 1,
                                'quote/fundingRate': 1,
                                'quote/klines': 1,
                                'quote/openInterest': 1,
                                'quote/ticker': 1,
                            },
                            'post': {
                            },
                        },
                        'private': {
                            'post': {
                            },
                        },
                    },
                },
                'contract': {
                    'v1': {
                        'public': {
                            'get': {
                                'allPosition': 1,
                                'allOrders': 1,
                                'balance': 1
                            },
                        },
                    },
                },
            },
            'timeframes': {
                '1m': '1m',
                '3m': '3m',
                '5m': '5m',
                '15m': '15m',
                '30m': '30m',
                '1h': '1h',
                '2h': '2h',
                '4h': '4h',
                '6h': '6h',
                '12h': '12h',
                '1d': '1D',
                '1w':  '1W',
                '1M':'1M'
            },
            'fees': {
                'trading': {
                },
            },
            'precisionMode': TICK_SIZE,
            'exceptions': {
                'exact': {
                },
                'broad': {},
            },
            'commonCurrencies': {
            },
            'options': {
            },
        });
    }

    async fetchSpotMarkets (params) {
        const response = await this.spotV1PublicGetCommonSymbols (params);
        //
        //    {
        //    "code": 0,
        //        "msg": "",
        //        "debugMsg": "",
        //        "data": {
        //          "symbols": [
        //            {
        //              "symbol": "GEAR-USDT",
        //              "minQty": 735,
        //              "maxQty": 2941177,
        //              "minNotional": 5,
        //              "maxNotional": 20000,
        //              "status": 1,
        //              "tickSize": 0.000001,
        //              "stepSize": 1
        //            },
        //          ]
        //        }
        //    }
        //
        const result = [];
        const data = this.safeValue (response, 'data');
        const markets = this.safeValue (data, 'symbols');
        for (let i = 0; i < markets.length; i++) {
            result.push (this.parseMarket (markets[i]));
        }
        return result;
    }

    parseMarket (market) {
        const id = this.safeString (market, 'symbol');
        const symbolParts = id.split ('-');
        const baseId = symbolParts[0];
        const quoteId = symbolParts[1];
        const base = this.safeCurrencyCode (baseId);
        const quote = this.safeCurrencyCode (quoteId);
        const symbol = base + '/' + quote;
        const pricePrecision = this.safeNumber (market, 'pricePrecision');
        const quantityPrecision = this.safeNumber (market, 'quantityPrecision');
        const type = pricePrecision === undefined ? 'swap' : 'spot';
        const spot = type === 'spot';
        const swap = type === 'swap';
        const contractSize = this.safeNumber (market, 'tradeMinLimit');
        const entry = {
            'id': id,
            'symbol': symbol,
            'base': base,
            'quote': quote,
            'settle': undefined,
            'baseId': baseId,
            'quoteId': quoteId,
            'settleId': undefined,
            'type': type,
            'spot': spot,
            'margin': false,
            'swap': swap,
            'future': false,
            'option': false,
            'active': this.safeString (market, 'status') === '1' ? true : false,
            'contract': swap,
            'linear': swap,
            'inverse': false,
            'taker': undefined,
            'maker': undefined,
            'contractSize': contractSize,
            'expiry': undefined,
            'expiryDatetime': undefined,
            'strike': undefined,
            'optionType': undefined,
            'precision': {
                'amount': quantityPrecision,
                'price': pricePrecision,
                'base': undefined,
                'quote': undefined,
            },
            'limits': {
                'leverage': {
                    'min': undefined,
                    'max': undefined,
                },
                'amount': {
                    'min': this.safeNumber (market, 'minQty'),
                    'max': this.safeNumber (market, 'maxQty'),
                },
                'price': {
                    'min': undefined,
                    'max': undefined,
                },
                'cost': {
                    'min': this.safeNumber(market, 'minNotional'),
                    'max': this.safeNumber(market, 'maxNotional'),
                },
            },
            'info': market,
        };
        return entry;
    }

    async fetchSwapMarkets (params) {
        const response = await this.swapV2PublicGetQuoteContracts (params);
        //
        //    {
        //        "code": 0,
        //        "msg": "",
        //        "data": [
        //          {
        //            "contractId": "100",
        //            "symbol": "BTC-USDT",
        //            "size": "0.0001",
        //            "quantityPrecision": 4,
        //            "pricePrecision": 1,
        //            "feeRate": 0.0005,
        //            "tradeMinLimit": 1,
        //            "maxLongLeverage": 150,
        //            "maxShortLeverage": 150,
        //            "currency": "USDT",
        //            "asset": "BTC",
        //            "status": 1
        //          },
        //        ]
        //    }
        //
        const result = [];
        const markets = this.safeValue (response, 'data');
        for (let i = 0; i < markets.length; i++) {
            result.push (this.parseMarket (markets[i]));
        }
        return result;
    }

    async fetchMarkets (params = {}) {
        /**
         * @method
         * @name bingx#fetchMarkets
         * @description retrieves data on all markets for bingx
         * @see https://bingx-api.github.io/docs/swapV2/market-api.html#_1-contract-information
         * @see https://bingx-api.github.io/docs/spot/market-interface.html#query-symbols
         * @param {object} params extra parameters specific to the exchange api endpoint
         * @returns {[object]} an array of objects representing market data
         */
        let marketType = undefined;
        [marketType, params] = this.handleMarketTypeAndParams('fetchBalance', undefined, params);
        if (marketType === 'spot') {
            return this.fetchSpotMarkets (params);
        } else if (marketType === 'swap') {
            return this.fetchSwapMarkets (params);
        }
    }

    async fetchOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params = {}) {
        /**
         * @method
         * @name bingx#fetchOHLCV
         * @description fetches historical candlestick data containing the open, high, low, and close price, and the volume of a market
         * @see https://bingx-api.github.io/docs/swap/market-api.html#_7-get-k-line-data
         * @param {string} symbol unified symbol of the market to fetch OHLCV data for
         * @param {string} timeframe the length of time each candle represents
         * @param {int|undefined} since timestamp in ms of the earliest candle to fetch
         * @param {int|undefined} limit the maximum amount of candles to fetch
         * @param {object} params extra parameters specific to the bingx api endpoint
         * @param {string|undefined} params.price "mark" or "index" for mark price and index price candles
         * @param {int|undefined} params.until timestamp in ms of the latest candle to fetch
         * @returns {[[int]]} A list of candles ordered as timestamp, open, high, low, close, volume
         */
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        request['interval'] = this.safeString (this.timeframes, timeframe, timeframe);
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        if (market['spot']) {
            throw new NotSupported (this.id + ' fetchOHLCV is not supported for spot markets');
        }
        const response = await this.swapV2PublicGetQuoteKlines (this.extend (request, params));
        //
        //    {
        //        "code": 0,
        //        "msg": "",
        //        "data": [
        //          {
        //            "open": "19396.8",
        //            "close": "19394.4",
        //            "high": "19397.5",
        //            "low": "19385.7",
        //            "volume": "110.05",
        //            "time": 1666583700000
        //          },
        //          {
        //            "open": "19394.4",
        //            "close": "19379.0",
        //            "high": "19394.4",
        //            "low": "19368.3",
        //            "volume": "167.44",
        //            "time": 1666584000000
        //          }
        //        ]
        //    }
        //
        let ohlcvs = this.safeValue (response, 'data', []);
        if (typeof ohlcvs === 'object') {
            ohlcvs = [ohlcvs];
        }
        return this.parseOHLCVs (ohlcvs, market, timeframe, since, limit);
    }

    parseOHLCV (ohlcv, market = undefined) {
        //
        //    {
        //        "open": "19394.4",
        //        "close": "19379.0",
        //        "high": "19394.4",
        //        "low": "19368.3",
        //        "volume": "167.44",
        //        "time": 1666584000000
        //    }
        //
        return [
            this.safeInteger (ohlcv, 'time'),
            this.safeNumber (ohlcv, 'open'),
            this.safeNumber (ohlcv, 'high'),
            this.safeNumber (ohlcv, 'low'),
            this.safeNumber (ohlcv, 'close'),
            this.safeNumber (ohlcv, 'volume'),
        ];
    }

    sign (path, section = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        const type = section[0];
        const version = section[1];
        const access = section[2];
        let url = this.implodeHostname (this.urls['api'][type]);
        url += '/' + version + '/';
        path = this.implodeParams (path, params);
        params = this.omit (params, this.extractParams (path));
        params = this.keysort (params);
        if (access === 'public') {
            url += path;
            if (Object.keys (params).length) {
                url += '?' + this.urlencode (params);
            }
        } else {
            this.checkRequiredCredentials ();
            headers = {
                'X-BX-APIKEY': this.apiKey,
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        
    }
}
