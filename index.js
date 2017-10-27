var loopTradeOnStart = false;
var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var log = require('./configs/logger')(module);
var async = require('async');
var app = express();
var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/out.log', {flags : 'a'});
var log_stdout = process.stdout;

var port = process.env.PORT || 8888;

String.prototype.endsWith = String.prototype.endsWith || function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

app.engine('ejs', require('ejs-locals'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

app.use(express.static(path.join(__dirname, 'public')));

var _ = require('lodash');

console.log = function(d) {
	var array = Array.prototype.slice.call(arguments, 0);
	array.splice(0, 0, UTILS.getTime() + ' |');
	array.push('\n');
	log_file.write(util.format.apply(null, array));
	log_stdout.write(util.format.apply(null, array));
};

var UTILS = {
	getTime : function () {
		return new Date((+new Date() + ( 3 * 60 * 60 * 1000))).toISOString().replace(/T/, ' ').replace(/\..+/, '');
	},
	makeId : function () {
	    return Math.random().toString(36).substring(7);
	},
	getRank : function(ask, bid, volume24H) {
		return ((ask-bid)/bid) * volume24H;
	},
	getInBTC : function(value, exchange_rate) {
		return value * exchange_rate;
	}
}



var TRADER = require('./tradeMethods');

TRADER.btc_usd = null;

TRADER.total_balances = null;
TRADER.available_balances = null;

TRADER.exchange_pairs = null;
TRADER.tradeable_exchange_pairs = null;

TRADER.closed_orders = [];
TRADER.open_buy_orders = [];
TRADER.open_sell_orders = [];
TRADER.closed_buy_orders = [];

TRADER.koef = 10;
TRADER.exchange_fee = 0.2;

// TRADER.max_buy_order_price = 50000 * satoshi;
// TRADER.max_buy_order_price = 0.00015;

TRADER.closed_orders_by_curr = {};
TRADER.open_sell_orders_by_curr = {};
TRADER.open_buy_orders_by_curr = {};
TRADER.closed_buy_orders_by_curr = {};

TRADER.able_to_sell_pairs = [];
TRADER.able_to_buy_pairs = [];


TRADER.prototype.checkCycle = function (callback) {

	var self = this;

	console.log('checkCycle:', this.exchange.name);

	async.waterfall([
		self.WRAPPER__getCurrenciesData.bind(self),
		self.wrapWait(self.WRAPPER__getBalance.bind(self)),
		self.wrapWait(self.WRAPPER__getOrders.bind(self)),
	], function (error, pairs_data) {
		console.log('pairs_data', self.pairs_data);
		callback();
	});
}

TRADER.prototype.tradeCycle = function (callback) {

	var self = this;

	console.log('tradeCycle:', this.exchange.name);

	async.waterfall([
		self.wrapWait(self.cancelOpenBuyOrdersCycle.bind(self), 2000, 2500),
		self.wrapWait(self.WRAPPER__getCurrenciesData.bind(self), 2000, 2500),
		self.wrapWait(self.WRAPPER__getOrders.bind(self), 2000, 2500),
		self.makeBuyAndSellData.bind(self),

		self.wrapWait(self.sellCycle.bind(self), 2000, 2500),
		self.wrapWait(self.buyCycle.bind(self), 2000, 2500),
		self.wrapWait(self.stopLossSellCycle.bind(self), 2000, 2500),
		self.wrapWait(self.checkCycle.bind(self), 2000, 2500)
	], function (error, data) {
		console.log('trade ended');
		callback();
	});
}

TRADER.prototype.WRAPPER__getOrders = function (next) {
	var self = this;
	this.getOrders({}, function (API_ORDERS) {
		
		self.open_sell_orders_by_curr = {};
		self.open_buy_orders_by_curr = {};
		self.closed_buy_orders_by_curr = {};
		self.closed_orders_by_curr = {};

		self.closed_orders = API_ORDERS.closed_orders;
		self.open_sell_orders = API_ORDERS.open_sell_orders;
		self.open_buy_orders = API_ORDERS.open_buy_orders;
		self.closed_buy_orders = API_ORDERS.closed_buy_orders;

		for (var k in self.closed_orders) {
			self.closed_orders_by_curr[self.closed_orders[k].currencyPair] = self.closed_orders_by_curr[self.closed_orders[k].currencyPair] || [];
			self.closed_orders_by_curr[self.closed_orders[k].currencyPair].push(self.closed_orders[k]);	
		}

		for (var i in self.open_sell_orders) {
			self.open_sell_orders_by_curr[self.open_sell_orders[i].currencyPair] = self.open_sell_orders_by_curr[self.open_sell_orders[i].currencyPair] || [];
			self.open_sell_orders_by_curr[self.open_sell_orders[i].currencyPair].push(self.open_sell_orders[i]);
		}

		for (var i in self.open_buy_orders) {
			self.open_buy_orders_by_curr[self.open_buy_orders[i].currencyPair] = self.open_buy_orders_by_curr[self.open_buy_orders[i].currencyPair] || [];
			self.open_buy_orders_by_curr[self.open_buy_orders[i].currencyPair].push(self.open_buy_orders[i]);
		}

		for (var i in self.closed_buy_orders) {
			self.closed_buy_orders_by_curr[self.closed_buy_orders[i].currencyPair] = self.closed_buy_orders_by_curr[self.closed_buy_orders[i].currencyPair] || [];
			self.closed_buy_orders_by_curr[self.closed_buy_orders[i].currencyPair].push(self.closed_buy_orders[i]);
		}

		self.total_balances = self.total_balances.map(function (el) {

			if (self.open_sell_orders_by_curr[el.currency + '/BTC']) {
				
				el.order_pairs = [];

				for (var i in self.open_sell_orders_by_curr[el.currency + '/BTC']) {
					var _pair = {
						buy_order : self.closed_buy_orders_by_curr[el.currency + '/BTC'][i],
						sell_order : self.open_sell_orders_by_curr[el.currency + '/BTC'][i]
					}
					if (self.open_buy_orders_by_curr[el.currency + '/BTC']) {
						_pair.open_order = self.open_buy_orders_by_curr[el.currency + '/BTC'][i];
					}
					el.order_pairs.push(_pair);
				}
			}
			return el;
		});

		API_ORDERS = null;

		next(null);
	});
}

TRADER.prototype.WRAPPER__getCurrenciesData = function (next) {

	var self = this;
	this.getTicker(function(_exchange_pairs) {

		_exchange_pairs = _exchange_pairs.map(function(el) {
			el.rank = UTILS.getRank(el.best_ask, el.best_bid, UTILS.getInBTC(el.volume, el.best_bid));
			return el;
		});
		_exchange_pairs = _.sortBy(_exchange_pairs, ['rank']).reverse();

		self.btc_usd = _exchange_pairs.filter(function(el) {
			return el.symbol == 'BTC/' + self.exchange.usdName;
		})[0];

		self.exchange_pairs = _exchange_pairs.filter(function(el) {
			// if (el.best_ask > 1000 * satoshi) {
			// 	el.tradeable = true;
			// }
			if (el.rank > 1) {
				el.tradeable = true;
			}
			return el.symbol.endsWith('/BTC');
		});

		_exchange_pairs = null;

		next(null);
	});
}

TRADER.prototype.WRAPPER__getBalance = function (next) {
	var self = this;
	this.getBalance({}, function (data) {
		self.available_balances = data.available;
		self.total_balances = data.total;

		self.total_balances = self.total_balances.map(function (balance_currency) {
			var _pair = self.exchange_pairs.filter(function (pair) {
				return balance_currency.currency == pair.currency;
			});
			if (_pair[0]) { 
				balance_currency.inBTC = UTILS.getInBTC(balance_currency.value, _pair[0].best_ask);
				balance_currency.best_ask = _pair[0].best_ask;
				balance_currency.best_bid = _pair[0].best_bid;
			 } else {
				balance_currency.inBTC = balance_currency.value;
			 }

			return balance_currency;
		});

		data = null;

		next(null);		
	});
}

var satoshi = 0.00000001;
var currenciesRankMap = {};
var connectors = {
	LiveCoin : require('./connectors/livecoin'),
	Bittrex : require('./connectors/bittrex'),
}

var BOT = function() {
	this.TRADERS = [];
	this.trade_cycle_time = 1000 * 60 * 10;
}

BOT.prototype.checkCycle = function (callback) {

	async.eachSeries(this.TRADERS, function (trader, next) {
		trader.checkCycle(next);
		// trader.tradeCycle(next);

	}, function (err, data) {
		callback(null);
	});
}

BOT.prototype.tradeCycle = function (callback) {
	console.log('bot trade cycle');
	async.eachSeries(this.TRADERS, function (trader, next) {
		trader.tradeCycle(next);
		// trader.tradeCycle(next);

	}, function (err, data) {
		callback(null);
	});
}

BOT.prototype.loopTradeCycle = function (callback) {
	console.log('loopTradeCycle STARTED');

	var self = this;

	run();

	interval = setInterval(run, this.trade_cycle_time);

	function run() {
		async.eachSeries(self.TRADERS, function (trader, next) {
			async.waterfall([
				trader.checkCycle.bind(trader),
				trader.tradeCycle.bind(trader)
			], function (error, data) {
				next(null);
			});
		}, function (err, data) {
		});
	}

	callback('ok');
}

BOT.prototype.stopLoopTradeCycle = function (callback) {
	console.log('loopTradeCycle STOPPED');
	clearInterval(interval);
	callback('ok');
}


BOT.prototype.addToTraders = function (exchangeName) {
	var tr = new TRADER();
	tr.useExchange(new connectors[exchangeName]());
	this.TRADERS.push(tr);
}

BOT.prototype.removeFromTraders = function (elN) {
	this.TRADERS.splice(elN, 1);
}

var bot = new BOT();
bot.addToTraders('LiveCoin');
bot.addToTraders('Bittrex');


if (loopTradeOnStart) {
	bot.loopTradeCycle(function () {});
}

TRADER.prototype.stopLossSellCycle = function (callback) {
	console.log('stopLossSellCycle:', this.exchange.name); 

	var self = this;

	var stop_loss_orders = [];

	var stop_loss_orders_can_sell = [];
	var stop_loss_orders_cant_sell = [];

	for ( var i in this.open_sell_orders) {
		var each_open_sell_order = this.open_sell_orders[i];
		// console.log('each_open_sell_order', each_open_sell_order.currencyPair, each_open_sell_order.quantity);

		var closed_buy_order = this.closed_buy_orders.filter(function (el) {
			return el.currencyPair == each_open_sell_order.currencyPair && el.quantity == each_open_sell_order.quantity;
		})[0];
		if (!closed_buy_order) {
			closed_buy_order = closed_buy_orders_for_this_curr = this.closed_buy_orders.filter(function (el) {
				return el.currencyPair == each_open_sell_order.currencyPair;
			})[0];
		}
		var currency = this.total_balances.filter(function (el) {
			return each_open_sell_order.currencyPair.split('/')[0] == el.currency;
		})[0];

		if (closed_buy_order && currency) {
			var diff = currency.best_ask * closed_buy_order.quantity - closed_buy_order.inBTC;
			var diff_perc = (diff / closed_buy_order.inBTC) * 100;

			if (diff_perc < -this.exchange.stop_loss_koef) {

				stop_loss_orders.push({
					id : each_open_sell_order.id, 
					currencyPair : each_open_sell_order.currencyPair, 
					sellPrice : currency.best_bid,
					quantity : each_open_sell_order.quantity,
					inBTC : currency.best_ask * closed_buy_order.quantity,
					diffPercentage : diff_perc
				});
			}
		}
	}

	stop_loss_orders_can_sell = stop_loss_orders.filter(function (el) {
		return el.inBTC > self.exchange.min_buy_order_price;
	});

	stop_loss_orders_cant_sell = stop_loss_orders.filter(function (el) {
		return el.inBTC <= self.exchange.min_buy_order_price;
	});

	// их надо докупить сперва и потом сбагрить нахуй
	// докупаем эти пары
	// делаем проверку
	// затем снова смотрим убыточные сделки
	// продаем всю сумму на балансе по этой валюте ( все вместе с докупленным )

	console.log('stop_loss_orders', stop_loss_orders_can_sell.map(function (el) {
		return el.currencyPair;
	}));

	async.eachSeries(stop_loss_orders_can_sell, function (order, serie_callback) {

		async.waterfall([
			self.wrapWait(self.cancelEachOrder.bind(self, order), 2000, 2500),
			self.wrapWait(self.sellEachOrderWithPrice.bind(self, order), 2000, 2500)
		], function (err, data) {
			serie_callback(null);
		});
		
	}, function (err, data) {
		callback();
	});
}

TRADER.prototype.makeBuyAndSellData = function (next) {

	self = this;

	self.tradeable_exchange_pairs = self.exchange_pairs.filter(function (el) {
		return el.tradeable;
	});

	self.able_to_buy_pairs = self.tradeable_exchange_pairs.map(function (el) {

		el.quantity = self.exchange.max_buy_order_price / el.best_ask;

		if (self.closed_orders_by_curr[el.symbol]) {
			el.success_counts = self.closed_orders_by_curr[el.symbol].filter(function (el) {
				return el.type == 'LIMIT_SELL';
			}).length;
		}
		if (self.open_sell_orders_by_curr[el.symbol]) {
			el.in_trade = self.open_sell_orders_by_curr[el.symbol] && self.open_sell_orders_by_curr[el.symbol].length;
		}

		return el;
	});

	self.able_to_buy_pairs = self.able_to_buy_pairs.filter(function (el) {
		return el.success_counts > 0 || (!el.success_counts && !el.in_trade);
	})
	.filter(function (el) {
		return el.in_trade < 1 || !el.in_trade;
	})
	.filter(function (el) {
		return el.rank >= 5000 && isFinite(el.rank);
	})
	.filter(function (el) {
		var value; 
		var currencyName = el.symbol.split('/')[0];
		var currency = self.total_balances.filter(function (_curr) {
			return _curr.currency == currencyName;
		})[0];
		if (currency) {
			value = currency.value;
		}
		// return !open_buy_orders_by_curr[el.symbol] && !value;
		// return !open_buy_orders_by_curr[el.symbol];
		var _curr_arr = self.available_balances.map(function (el) {
			return el.currency;
		}).filter(function (el) {
			return el != 'BTC';
		});

		return _curr_arr.indexOf(currencyName) == -1 && !self.open_buy_orders_by_curr[el.symbol];
	});

	self.able_to_sell_pairs = self.available_balances.filter(function (el) {
		if (self.closed_buy_orders_by_curr[el.currency + '/BTC']) {
			el.buy_order = self.closed_buy_orders_by_curr[el.currency + '/BTC'].filter(function (_curr) {
				return _curr.quantity == el.value;
			})[0];
			if (!el.buy_order) {
				el.buy_order = self.closed_buy_orders_by_curr[el.currency + '/BTC'][0];
			}
		}

		return el.currency != 'BTC';
	});

	if (next) next();

}

TRADER.prototype.sellCycle = function (next) {

	var self = this;

	console.log('sellCycle', this.able_to_sell_pairs.map(function (el) {
		return el.currency;
	}));

	async.eachSeries(self.able_to_sell_pairs, function (pair, serie_callback) {

		self.wrapWait(self.sellEachPair.bind(self, pair, serie_callback), 2000, 2500)();
		
	}, function(error, data) {
		next(null);
	});
}

TRADER.prototype.sellEachPair = function (pair, next) {

	console.log('sellEachPair');

	if (!pair.buy_order) {
		console.log('pair hasnt buy order', this.closed_buy_orders_by_curr[pair.currency + '/BTC']);
		next(null);
		return;
	}
	// var symbols_after_comma = pair.buy_order.price.toString().length - 2;
	var sell_price = (pair.buy_order.price / 100 * (100 + this.exchange.profit_koef));
	var pair_name = pair.currency + '/BTC';

	if (sell_price * pair.value < this.exchange.max_buy_order_price) {
		sell_price = this.exchange.max_buy_order_price / pair.value;
	}

	console.log('bought with', pair.buy_order.price);
	console.log('lets try sell', pair.value, 'with', sell_price, 'for inBTC',  sell_price * pair.value);
	console.log('pair_name', pair_name);
	this.sellLimit(pair_name, sell_price.toFixed(8), pair.value, function (data, error) {
		console.log(data.success, 'error', error);
		next(null);
	});
}

TRADER.prototype.sellEachOrderWithPrice = function (order, next) {
	console.log('sellEachOrderWithPrice');

	this.sellLimit(order.currencyPair, order.sellPrice, order.quantity, function (data, error) {
		console.log(data.success, 'error', error);
		next(null);
	});
}

TRADER.prototype.cancelOpenBuyOrdersCycle = function (next) {

	var self = this;

	console.log('cancelOpenBuyOrdersCycle pairs', this.open_buy_orders.length);

	async.eachSeries(self.open_buy_orders, function (order, serie_callback) {

		self.wrapWait(self.cancelEachOrder.bind(self, order, serie_callback), 2000, 2500)();

	}, function (error, data) {
		next(null);
	});
}

TRADER.prototype.cancelEachOrder = function (order, next) {
	var id = order.id;
	var currencyPair = order.currencyPair;

	console.log('cancelEachOrder', id, currencyPair);

	this.cancelLimit(currencyPair, id, function (data, error) {
		console.log('success', data.success, 'error', error);
		next(null);
	});
}

TRADER.prototype.buyCycle = function (next) {

	var self = this;

	this.btc_value = this.available_balances.filter(function (el) {
		return el.currency == 'BTC';
	})[0].value;

	if (this.btc_value < this.exchange.max_buy_order_price) {
		console.log('btc value is too low', this.btc_value + ' BTC');
		next(null);
		return;		
	}

	var work_buy_pairs = this.able_to_buy_pairs.slice(0, 5);

	console.log('buyCycle', this.btc_value, work_buy_pairs.map(function (el) {
		return el.symbol;
	}));
	
	async.eachSeries(work_buy_pairs, function (pair, serie_callback) {

		self.wrapWait(self.buyEachPair.bind(self, pair, serie_callback), 2000, 2500)();

	}, function (error, data) {
		next(null);
	});
}

TRADER.prototype.buyEachPair = function (pair, next) {
	var pair_name = pair.symbol;
	var buy_price = pair.best_bid;
	var value = ((self.exchange.max_buy_order_price * 101 / 100) / buy_price);

	if (this.btc_value < self.exchange.max_buy_order_price) {
		console.log('btc value is too low', this.btc_value + ' BTC');
		next(null);
		return;		
	}

	// trader.buyLimit(pair_name, buy_price.toFixed(5), value, function (data, error) {
	this.buyLimit(pair_name, buy_price.toFixed(8), value.toFixed(8), function (data, error) {
		if (!error) {
			self.btc_value -= buy_price * value;
		}
		console.log('success', data.success, 'error', error);
		next(null);
	});
}

// if (loopTradeOnStart) {
// 	loopTradeCycle(function () {});
// }

app.get('/', function (req, res, next) {
	res.render('index', {
		bot : bot
	});
});

app.post('/getChartData', function (req, res, next) {
	trader.getChartData('m15', req.body.currencyPair, function (data) {
		res.json(data);
	});
});

app.post('/loopTradeCycle', function (req, res, next) {
	bot.loopTradeCycle(function (data) {
		res.json('ok');
	});
});

app.post('/stopLoopTradeCycle', function (req, res, next) {
	bot.stopLoopTradeCycle(function (data) {
		res.json('ok');
	});
});

app.post('/tradeCycle', function (req, res, next) {
	bot.tradeCycle(function (data) {
		res.json({
			bot : bot
		});
	});
});

app.post('/saveTraderChanges', function (req, res, next) {
	data = req.body;
	console.log(data);
	for (var i in bot.TRADERS) {
		if (bot.TRADERS[i].exchange.name == data.name) {
			bot.TRADERS[i].exchange.stop_loss_koef = data.stop_loss_koef;
			bot.TRADERS[i].exchange.profit_koef = data.profit_koef;
		}
	}
	res.json({
		success : true
	});
});

app.post('/checkCycle', function (req, res, next) {
	bot.checkCycle(function () {
		res.json({
			bot : bot
		});
	});
});

app.get('/log', function (req, res, next) {
    res.sendfile('out.log');
});

app.listen(port, function() {
    console.log('Node app is running on port', port);
});
