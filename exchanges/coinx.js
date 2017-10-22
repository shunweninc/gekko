var CoinX = require('./coinxadapter.js');
var util = require('../core/util.js');
var _ = require('lodash');
var moment = require('moment');
var log = require('../core/log');

var Trader = function(config) {
  _.bindAll(this);
  if(_.isObject(config)) {
    this.key = config.key;
    this.secret = config.secret;
    this.clientID = config.username;
    this.asset = config.asset.toLowerCase();
    this.currency = config.currency.toLowerCase();
    this.market = this.asset + this.currency;
  }
    this.name = 'coinx';
    this.coinx = new CoinX(this.key, this.secret);
    this.lastTid = false;
}

// if the exchange errors we try the same call again after
// waiting 10 seconds
Trader.prototype.retry = function(method, args) {
    var wait = +moment.duration(10, 'seconds');
    log.debug(this.name, 'returned an error, retrying..');

    var self = this;

    // make sure the callback (and any other fn)
    // is bound to Trader
    _.each(args, function(arg, i) {
        if (_.isFunction(arg))
            args[i] = _.bind(arg, self);
    });

    // run the failed method again with the same
    // arguments after wait
    setTimeout(
        function() {
            method.apply(self, args)
        },
        wait
    );
}

Trader.prototype.getPortfolio = function(callback) {
  var calculate = function(err, data) {
    if(err) {
      if(err.message === 'invalid api key')
        util.die('Your ' + this.name + ' API keys are invalid');
      return this.retry(this.coinx.getMember, calculate);
    }

    var portfolio = [];
    _.each(data.accounts, function(account) {
      portfolio.push({name: account.currency.toUpperCase(), amount: + account.balance});
    });

    callback(err, portfolio);
  }.bind(this);

  this.coinx.getMember(calculate);
}

Trader.prototype.getTicker = function(callback) {
  this.coinx.ticker(this.asset, this.currency, callback);
}

Trader.prototype.getFee = function(callback) {
  var makerFee = 0.1;
  callback(false, makerFee / 100);
}

Trader.prototype.buy = function(amount, price, callback) {
  var args = _.toArray(arguments);
  var set = function(err, result) {
    if(err || result.status === "error") {
      log.error('unable to buy:', err, result.reason, 'retrying...');
      return this.retry(this.buy, args);
    }

    callback(null, result.id);
  }.bind(this);

  //Decrease amount by 1% to avoid trying to buy more than balance allows.
  amount -= amount / 100;

  amount *= 100000000;
  amount = Math.floor(amount);
  amount /= 100000000;

  // prevent:
  // 'Ensure that there are no more than 2 decimal places.'
  // price *= 100;
  // price = Math.floor(price);
  // price /= 100;

  this.coinx.buy(this.asset, this.currency, price, amount, set);
}

Trader.prototype.sell = function(amount, price, callback) {
  var args = _.toArray(arguments);
  var set = function(err, result) {
    if(err || result.status === "error") {
      log.error('unable to sell:', err, result.reason, 'retrying...');
      return this.retry(this.sell, args);
    }

    callback(null, result.id);
  }.bind(this);

  // prevent:
  // 'Ensure that there are no more than 8 decimal places.'
  amount *= 100000000;
  amount = Math.floor(amount);
  amount /= 100000000;

  // prevent:
  // 'Ensure that there are no more than 2 decimal places.'
  // price *= 100;
  // price = Math.ceil(price);
  // price /= 100;

  this.coinx.sell(this.asset, this.currency, price, amount, set);
}


Trader.prototype.getOrder = function(order_id, callback) {
  var args = _.toArray(arguments);
  var get = function(err, data) {
    if(!err && _.isEmpty(data) && _.isEmpty(data.result))
      err = 'no data';

    else if(!err && !_.isEmpty(data.error))
      err = data.error;

    if(err) {
      log.error('Unable to get order', order, JSON.stringify(err));
      return this.retry(this.getOrder, args);
    }

    var order = _.find(data, o => o.uid === +order_id);

    if(!order) {
      // if the order was cancelled we are unable
      // to retrieve it, assume that this is what
      // is happening.
      return callback(err, {
        price: 0,
        amount: 0,
        date: moment(0)
      });
    }

    var price = parseFloat(order.price);
    var amount = Math.abs(parseFloat(order.volume));
    var date = moment(order.created_at);

    callback(err, {price, amount, date});
  }.bind(this);

  this.coinx.getOrder(order_id, get);
}

Trader.prototype.checkOrder = function(order_id, callback) {
  var check = function(err, result) {
    var stillThere = _.find(result, function(o) { return o.id === order });
    callback(err, !stillThere);
  }.bind(this);

  this.coinx.getOrder(order_id, check);
}

Trader.prototype.cancelOrder = function(order_id, callback) {
  var args = _.toArray(arguments);
  var cancel = function(err, result) {
    if(err || !result) {
      log.error('unable to cancel order', order, '(', err, result, ')');
      return this.retry(this.cancelOrder, args);
    }
    callback();
  }.bind(this);

  this.coinx.cancel_order(order_id, cancel);
}

Trader.prototype.getTrades = function(since, callback, descending) {
  var args = _.toArray(arguments);
  var process = function(err, trades) {
    if(err)
      return this.retry(this.getMyTrades, args);

    var result = _.map(trades, t => {
      return {
        date: moment(t.created_at).format('X'), // format with second unix
        tid:  +t.id,
        price: +t.price,
        amount: +t.volume
      }
    });
    callback(null, result.reverse());
  }.bind(this);

  this.coinx.getRecentTrades(this.asset, this.currency, null, null, null, null, null, process);
}

Trader.getCapabilities = function () {
  return {
    name: 'CoinX',
    slug: 'coinx',
    currencies: ['BTC', 'ETH'],
    assets: ['ETH', 'OPC'],
    maxTradesAge: 60,
    markets: [
      { pair: ['BTC', 'ETH'], minimalOrder: { amount: 0.001, unit: 'currency' } },
      { pair: ['BTC', 'OPC'], minimalOrder: { amount: 5, unit: 'asset' } },
      { pair: ['ETH', 'OPC'], minimalOrder: { amount: 5, unit: 'asset' } },
    ],
    requires: ['key', 'secret', 'username'],
    fetchTimespan: 60,
    tid: 'tid', // id havd already converted to tid
    tradable: true
  };
}

module.exports = Trader;
