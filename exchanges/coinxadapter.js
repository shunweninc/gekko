//Create module for CoinX exchange to call the APIs
module.exports = (function() {
    'use strict';

    // Module dependencies
    var crypto  = require('crypto'),
        request = require('request'),
        nonce   = require('nonce')();
    var Gkey='';
    var Gsign=''; //global var, FIXME should use one from constructor
    var GSecret = '';

    // Constants
    var version  = '0.0.6',
        API_URL  = 'http://peatio.dev:4000/api/v2',
        HASH_URL = '/api/v2',
        USER_AGENT = 'coinx.js ' + version;
    var errorMsg = "Missing Params";
    //USER_AGENT    = 'Mozilla/5.0 (Windows NT 6.3; WOW64; rv:26.0) Gecko/20100101 Firefox/26.0'

    // Helper methods
    function joinCurrencies(asset, currency) {
        // If only one arg, then return the first
        if (typeof currency !== 'string') {
            return asset;
        }
        return asset.toLowerCase()  + currency.toLowerCase();
    }

    function sortParameters(a, b) {
        return 0;   // FIXME: ????
        // Sort `nonce` parameter last, and the rest alphabetically
        return a === 'nonce' || a > b ? 1 : -1;
    }

    function cleanUpParam(param) {
        for (var key in param) {
            if (param[key] == null) {
                delete param[key];
            }
        }
    }

    // Constructor
    function CoinX(key, secret) {
        Gkey = key;
        GSecret = secret;
        // Generate headers signed by this user's key and secret.
        // The secret is encapsulated and never exposed
        this._getPrivateHeaders = function(parameters,link) {
            var paramString, signature;
            var url = "POST|"+HASH_URL+link+"|";
            if (!key || !secret){
                throw 'CoinX: Error. API key and secret required';
            }

            // Sort parameters alphabetically and convert to `arg1=foo&arg2=bar`
            paramString = Object.keys(parameters)
                .sort(parameters)
                .map(function(param) {
                    return encodeURIComponent(param) + '=' + encodeURIComponent(parameters[param]);
                })
                .join('&');
            var signature = crypto.createHmac('SHA256', secret).update(url+paramString).digest('hex');
            parameters.signature = signature

            signature = crypto.createHmac('sha256', secret).update(paramString).digest('hex');
           //console.log("SIGNATURE " +signature)

            Gkey = key
            Gsign = signature
            GSecret = secret
            return {
                Key: key,
                Sign: signature
            };
        };
    }

    // Currently, this fails with `Error: CERT_UNTRUSTED`
    // CoinX.STRICT_SSL can be set to `false` to avoid this. Use with caution.
    // Will be removed in future, once this is resolved.
    //CoinX.STRICT_SSL = false;

    // Customisable user agent string
    CoinX.USER_AGENT = USER_AGENT;

    // Prototype
    CoinX.prototype = {
        constructor: CoinX,
        // Make an API request
        _request: function(options, callback) {
            request(options, function(err, response, body) {
                // Empty response
                if (!err && (typeof body === 'undefined' || body === null)){
                    err = 'Empty response';
                }
                callback(err, body);
            });
            return this;
        },

        // Make a public API request
        _public: function(link, parameters, callback){
            var options;
            if (typeof parameters === 'function') {
                callback = parameters;
                parameters = {};
            }
            parameters || (parameters = {});
            options = {
                method: 'GET',
                url: API_URL+link,
                qs: parameters
            };
            return this._request(options, callback);
        },

        // Make a private API request POST
        _privatePost: function(link, parameters, callback){
            var options;
            if (typeof parameters === 'function'){
                callback = parameters;
                parameters = {};
            }

            parameters || (parameters = {});
            parameters.tonce = nonce()/100;
            parameters.access_key = Gkey;
            var paramString = Object.keys(parameters)
                .sort(parameters)
                .map(function(param) {
                    return encodeURIComponent(param) + '=' + encodeURIComponent(parameters[param]);
                })
                .join('&');

           // var signature = (crypto.createHmac('sha256', secret).update(url+paramString).digest('hex')).toString();
           // parameters.signature = signature
           //// console.log(signature + " tonce " + parameters.tonce)
            options = {
                method: "POST",
                url: API_URL+link,
                form: parameters,
                headers: this._getPrivateHeaders(parameters,link)
            };
            options.headers['User-Agent'] = "CoinX API Client/0.0.1"
            return this._request(options, callback);
        },

        // Make a private API request GET
        _privateGet: function(link, parameters, callback) {
            var options;
            var url = "GET|"+HASH_URL+link+"|";

            if (typeof parameters === 'function') {
                callback = parameters;
                parameters = {};
            }

            parameters || (parameters = {});
            parameters.access_key = Gkey;
            parameters.tonce = parseInt(nonce()/100 );

            var paramString = Object.keys(parameters)
                .sort(parameters)
                .map(function(param) {
                    return encodeURIComponent(param) + '=' + encodeURIComponent(parameters[param]);
                })
                .join('&');

            var signature = crypto.createHmac('sha256', GSecret).update(url+paramString).digest('hex');
            parameters.signature = signature;
            paramString = paramString +"&"+encodeURIComponent('signature') + "=" + encodeURIComponent(signature);
            options = {
                method: 'GET',
                url: API_URL+link+"?"+paramString
            };
            console.log(options);
            return this._request(options, callback);
        },

        // PUBLIC METHODS
        getTicker: function(asset, currency, callback){
            if(!asset  || !currency) {
                return callback (errorMsg, null);
            } else {
                var params = { market: joinCurrencies(asset, currency) };
                var url = '/tickers/' + joinCurrencies(asset, currency) + '.json'
                return this._public(url, params, callback);
            }
        },

        getAllTickers: function(callback) {
            return this._public("/tickers.json", {}, callback);
        },

        getDepth: function(asset, currency, limit, callback) {
            if (!asset || !currency) {
                return callback(errorMsg, null);
            } else {
                var parameters = {
                    market: joinCurrencies(asset, currency),
                    limit:  limit ? limit : 300
                };
                return this._public('/depth.json', parameters, callback);
            }
        },

        getOrderBook: function(asset, currency, askLimit, bidLimit, callback){
            if(!asset  || !currency) {
                return callback(errorMsg, null);
            } else {
                var parameters = {
                    market:     joinCurrencies(asset, currency),
                    asks_limit: askLimit ? askLimit : 20,
                    bids_limit: bidLimit ? bidLimit : 20
                };
                return this._public('/order_book.json', parameters, callback);
            }
        },

        getMarkets: function(callback) {
            return this._public("/markets.json", {}, callback);
        },

        getTimestamp: function(callback) {
            return this._public("/timestamp.json", {}, callback);
        },

        getK: function(asset, currency, limit, period, timestamp, callback){
            if(!asset || !currency) {
                return callback(errorMsg, null);
            } else {
                var param = {
                    market:    joinCurrencies(asset, currency),
                    limit:     limit ? Limit : null,
                    period:    period ? period : null,
                    timestamp: timestamp ? timestamp : null
                }
                cleanUpParam(param);
                return this._public("/k.json", param, callback);
            }
        },

        KPendingTrades: function(asset, currency, tradeId, limit, period, timestamp, callback){
            if(!asset || !currency || !tradeId) {
                return  callback(errorMsg, null);
            } else {
                var param = {
                    market:    joinCurrencies(asset, currency),
                    trade_id:  tradeId,
                    period:    period ? period : null,
                    timestamp: timestamp ? timestamp : null
                }
                cleanUpParam(param);
                return this._public("/k_with_pending_trades.json", param, callback);
            }
        },

        //// PRIVATE GET
        getMember: function(callback) {
            var url = "/members/me.json";
            return this._privateGet(url, {}, callback);
        },

        getAllDeposits : function(currency, limit, state, callback){
             if(!currency) {
                return callback(errorMsg,null)
             } else {
                 var param = {
                     currency: currency,
                     limit: limit ? limit : 100,
                     state: state ? state : "wait"
                 };
                 return this._privateGet("/deposits.json", param, callback);
             }
        },

        getDeposit: function(transaction, callback) {
            if (!transaction) {
                return callback(errorMsg, null);
            } else {
                var param = { txid: transaction };
                return this._privateGet("/deposit.json", param, callback);
            }
        },

        getDepositAddress: function(InCurrency, callback) {
            if (!InCurrency) {
               return callback(errorMsg,null)
            } else {
                var param = { currency: InCurrency };
                return this._privateGet("/deposit_address.json", param, callback);
            }
        },

        getAllOrders: function(asset, currency, state, limit, page, orderBy, callback){
            if (!asset || !currency ) {
               return callback(errorMsg, null);
            }
            var param = {
                state:    state ? state : "wait",
                limit:    limit ? limit : 100,
                page:     page ? page  : 0 ,
                order_by: orderBy? orderBy : 'asc',
                market :  joinCurrencies(asset, currency)
            }
            return this._privateGet("/orders.json", param, callback);
        },

        getOrder: function(orderId, callback) {
            if (!orderId) {
                return callback(errorMsg, null);
            }
            var param = { id : orderId };
            return this._privateGet("/order.json", param, callback);
        },

        myBalances: function(callback){
            return this._privateGet('/members/me.json', callback);
        },

        getRecentTrades : function(asset, currency, limit, timestamp, from, to, orderby, callback){
            if (!asset || !currency) {
              return  callback(errorMsg, null);
            }
            var params = {
                market:    joinCurrencies(asset, currency),
                limit:     limit ? limit : 50,
                timestamp: timestamp ? timestamp : null,
                from:      from ? from : null,
                to:        to ? to : null,
                order_by : orderby  ? orderby : "desc"
            }
            cleanUpParam(params);
            return this._public("/trades.json", params, callback);
        },

        getMyTrades: function(asset, currency, limit, timestamp, from, to, orderby, callback) {
            if (!asset || !currency) {
               return callback(errorMsg, null);
            }
            var param = {
                market:    joinCurrencies(asset, currency),
                limit:     limit ? limit : 50,
                timestamp: timestamp ? timestamp : null,
                from:      from ? from : null,
                to:        to ? to : null,
                order_by : orderby  ? orderby : "desc"
            }
            cleanUpParam(param);
            return this._privateGet("/trades/my.json", param, callback);
        },

        /////PRIVATE POST
        buy: function(asset, currency, rate, amount, callback){
            if(!asset || !currency || !rate || !amount){
               return callback(errorMsg, null);
            }
            var parameters = {
                market: joinCurrencies(asset, currency),
                price:  rate,
                volume: amount,
                side :  'buy'
            };
            return this._privatePost('/orders.json', parameters, callback);
        },

        sell: function(asset, currency, rate, amount, callback){
            if (!asset || !currency || !rate || !amount){
               return callback(errorMsg, null);
            } else {
                var parameters = {
                    market: joinCurrencies(asset, currencyB),
                    price:  rate,
                    volume: amount,
                    side:   'sell'
                };
                return this._privatePost('/orders.json', parameters, callback);
            }
        },

        cancelAllOrders: function(side, callback) {
            if (side) {
                var param = { side : side };
                return this._privatePost("/orders/clear.json",param,callback);
            } else {
                return this._privatePost("/orders/clear.json", {}, callback);
            }
        },

        cancelOrder: function(orderId, callback) {
            if (!orderId) {
                return callback(errorMsg, null);
            } else {
                var param = { id: orderId };
                return this._privatePost("/order/delete.json", param, callback);
            }
        }
    };
    return CoinX;
})();