var loopTradeOnStart = false;
var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var mongoose = require('./configs/mongoose');
var log = require('./configs/logger')(module);
var config = require('./configs/config_file');
var async = require('async');
var app = express();
var fs = require('fs');
var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/out.log', {flags : 'a'});
var log_stdout = process.stdout;
var BOT = require('./bot');

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

mongoose.Promise = global.Promise;
mongoose.connection.on('open', function () {
    log.info('connected to database ' + config.get('db:name'));
});

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

TRADER.closed_orders_by_curr = {};
TRADER.open_sell_orders_by_curr = {};
TRADER.open_buy_orders_by_curr = {};
TRADER.closed_buy_orders_by_curr = {};

TRADER.able_to_sell_pairs = [];
TRADER.able_to_buy_pairs = [];


TRADER.prototype.checkCycle = function (callback) {

	var self = this;

	if (!this.active) {
		console.log('Биржа неактивна', self.exchange.name);
		return callback();
	}

	console.log('Цикл проверки', this.exchange.name);

	async.waterfall([
		self.wrapWait(self.getUserSummaries.bind(self)),
		self.wrapWait(self.getUserBalances.bind(self)),
		self.wrapWait(self.getUserOrders.bind(self)),
		self.wrapWait(self.syncRemoteOrdersWithLocal.bind(self))
	], function (error, pairs_data) {
		callback();
	});
}

TRADER.prototype.checkBaseToFiatTrend = function (callback) {}

TRADER.prototype.tradeCycle = function (callback) {

	var self = this;

	if (!this.active) {
		console.log('Биржа неактивна', self.exchange.name);
		return callback();
	}

	console.log('Цикл торговли', this.exchange.name);

	var check_parameter = 'close';

	self.getChartData(null, 'BTC/' + this.exchange.usdName, function (err, data) {

		var isRaising;

		if (!data) {
			isRaising = false;
		} else {
			arr = data.slice(data.length - 3);
			console.log('Проверка тренда торгуемой валюты к фиату', self.exchange.name);
			console.log('10м назад:', arr[0][check_parameter], '. 5м назад:', arr[1][check_parameter], '. Текущее значение:', arr[2][check_parameter]);
			isRaising = arr[2][check_parameter] - arr[0][check_parameter] > 0;
		}

		if (isRaising) {

			console.log('Валюта растет: Продаем все пары');
			self.stopLossOrQuickSellCycle(true, callback);

		} else {

			console.log('Валюта падает: Стандартный прогон');
			async.waterfall([
				self.cancelOpenBuyOrdersCycle.bind(self),
				self.checkCycle.bind(self),

				self.makeBuyAndSellData.bind(self),
				self.sellCycle.bind(self),
				self.buyCycle.bind(self),
				self.stopLossOrQuickSellCycle.bind(self, false),
				self.checkCycle.bind(self)
			], function (error, data) {
				console.log('trade ended');
				callback();
			});
		}
	});

}

TRADER.prototype.getUserOrders = function (next) {
	var self = this;
	this.getOrders({}, function (API_ORDERS) {


		self.baseConnector.findOrders({}, function (err, ORDERS_FROM_BASE) {

			var ORDERS = _(ORDERS_FROM_BASE)
				.concat(API_ORDERS)
				.groupBy("exchangeId")
				.map(_.spread(_.merge))
				.value();

			self.open_sell_orders = ORDERS.filter(function (el) {
				return el.type == 'LIMIT_SELL' && el.orderStatus == 'OPEN';
			});
			self.open_buy_orders = ORDERS.filter(function (el) {
				return el.type == 'LIMIT_BUY' && el.orderStatus == 'OPEN';
			});
			self.closed_buy_orders = ORDERS.filter(function (el) {
				return el.type == 'LIMIT_BUY' && (el.orderStatus == 'EXECUTED' || el.orderStatus == 'PARTIALLY_FILLED_AND_CANCELLED');
			});
			self.closed_orders = ORDERS.filter(function (el) {
				return el.orderStatus == 'EXECUTED' || el.orderStatus == 'PARTIALLY_FILLED_AND_CANCELLED';
			});

			self.open_sell_orders_by_curr = {};
			self.open_buy_orders_by_curr = {};
			self.closed_buy_orders_by_curr = {};
			self.closed_orders_by_curr = {};

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
						var _closed_orders = self.closed_buy_orders_by_curr[el.currency + '/BTC'];
						var _pair = {
							buy_order : _closed_orders && _closed_orders[i],
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

			ORDERS = null;

			next(null);
		});
		
	});
}

TRADER.prototype.getUserSummaries = function (next) {

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
			ex1 = el.rank > self.exchange.ok_rank_value;
			ex2 = el.best_ask > 10000 * satoshi;
			ex3 = ((el.best_ask - el.best_bid)/el.best_bid) * 100 > self.exchange.ok_spread_value;

			if (ex1 && ex2 && ex3) {
				el.tradeable = true;
			}

			return el.symbol.endsWith('/BTC');
		});

		_exchange_pairs = null;

		next(null);
	});
}

TRADER.prototype.getUserBalances = function (next) {
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

TRADER.prototype.stopLossOrQuickSellCycle = function (force, callback) {

	if (!force) {
		console.log('Цикл стоп-лосс продаж:', this.exchange.name); 
	} else {
		console.log('Цикл экстренных продаж:', this.exchange.name); 
	}

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

			if (diff_perc < -this.exchange.stop_loss_koef || force) {

				stop_loss_orders.push({
					exchangeId : each_open_sell_order.exchangeId, 
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

	console.log('Ордера на продажу:', stop_loss_orders_can_sell.map(function (el) {
		return el.currencyPair;
	}));

	async.eachSeries(stop_loss_orders_can_sell, function (order, serie_callback) {

		async.series([
			self.cancelOrder.bind(self, order),
			self.sellPairWithPrice.bind(self, order)
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
		return el.rank >= self.exchange.ok_rank_value && isFinite(el.rank);
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

	// for (var i in self.able_to_sell_pairs) {

	// 	var p = self.able_to_sell_pairs[i];

	// 	console.log('пара', p.currency, 'была куплена', p.buy_order.price);
	// 	var sell_price = (pair.buy_order.price / 100 * (100 + this.exchange.profit_koef));
	// 	console.log('продаем за', pair.price);
	// 	console.log('было', p.buy_order.price * p.value, 'стало ', p.price * p.value);
	// }

	if (next) next();

}

TRADER.prototype.sellCycle = function (next) {

	var self = this;

	console.log('sellCycle', this.able_to_sell_pairs.map(function (el) {
		return el.currency;
	}));

	async.eachSeries(self.able_to_sell_pairs, function (pair, serie_callback) {

		self.wrapWait(self.sellPairWithProfit.bind(self, pair, serie_callback))();
		
	}, function(error, data) {
		next(null);
	});
}

TRADER.prototype.sellPairWithProfit = function (pair, next) {

	var self = this;

	console.log('sellPairWithProfit');

	if (!pair.buy_order) {
		console.log('pair hasnt buy order', this.closed_buy_orders_by_curr[pair.currency + '/BTC']);
		next(null);
		return;
	}

	var tax = pair.buy_order.price * ( 2 * this.exchange.exchange_fee);
	var sell_price = (pair.buy_order.price / 100 * (100 + this.exchange.profit_koef)) + tax;
	var pair_name = pair.currency + '/BTC';

	if (sell_price * pair.value < this.exchange.max_buy_order_price) {
		sell_price = this.exchange.max_buy_order_price / pair.value;
	}

	// console.log('bought with', pair.buy_order.price);
	console.log('Выставляем ордер на продажу', pair.value, 'по цене', sell_price, 'Ожидаемый доход', (sell_price * pair.value) - (pair.buy_order.price * pair.value), 'Такса', tax);
	// console.log('pair_name', pair_name);
	this.sellLimit(pair_name, +sell_price.toFixed(8), pair.value, function (error, data) {
		if (error) {
			console.log('Ошибка выставления ордера на продажу', error);
			next(null);
			return;
		} else {
			console.log('Ордер на продажу успешно выставлен', pair_name, 'по цене', sell_price);
			self.baseConnector.saveOrder({
				exchangeId : data.exchangeId,
				currencyPair : pair_name,
				type : 'LIMIT_SELL',
				orderStatus : 'OPEN'
			}, function (err, data) {
				if (!err) console.log('Ордер сохранен в базу');
				else console.log('Ошибка сохранения в базу');

				next(null);
			});		
		}
	});
}

TRADER.prototype.sellPairWithPrice = function (order, next) {
	console.log('sellPairWithPrice');

	var self = this;

	this.sellLimit(order.currencyPair, order.sellPrice, order.quantity, function (error, data) {
		if (error) {
			console.log('Ошибка выставления ордера на продажу', error);
			next();
		} else {
			console.log('Ордер на продажу успешно выставлен', order.currencyPair, 'по цене', order.sellPrice);
			self.baseConnector.saveOrder({
				exchangeId : data.exchangeId,
				currencyPair : order.currencyPair,
				type : 'LIMIT_SELL',
				orderStatus : 'OPEN'
			}, function (err, data) {
				if (!err) console.log('Ордер сохранен в базу');
				else console.log('Ошибка сохранения в базу');

				next();
			});		
		}
	});
}

TRADER.prototype.cancelOpenBuyOrdersCycle = function (next) {

	var self = this;

	console.log('cancelOpenBuyOrdersCycle pairs', this.open_buy_orders.length);

	async.eachSeries(self.open_buy_orders, function (order, serie_callback) {

		self.wrapWait(self.cancelOrder.bind(self, order, serie_callback))();

	}, function (error, data) {
		next(null);
	});
}

TRADER.prototype.cancelOrder = function (order, next) {
	var id = order.exchangeId;
	var currencyPair = order.currencyPair;
	var self = this;

	console.log('cancelOrder', id, currencyPair);

	this.cancelLimit(currencyPair, id, function (error, data) {
		console.log('DEBUG!!!', error, data);
		if (error) {
			console.log('Ошибка отмены ордера');
			next(null);
		} else {
			self.baseConnector.removeOrder(order.exchangeId, function (err, data) {
				if (!err) console.log('Ордер успешно удален');
				else console.log('Ошибка отмены ордера', err);

				next(null, data);
			});
		}
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

		self.wrapWait(self.buyPair.bind(self, pair, serie_callback))();

	}, function (error, data) {
		next(null);
	});
}

TRADER.prototype.buyPair = function (pair, next) {
	var self = this;
	var pair_name = pair.symbol;
	var buy_price = +pair.best_bid;
	var value = +((self.exchange.max_buy_order_price * 101 / 100) / buy_price);

	if (this.btc_value < self.exchange.max_buy_order_price) {
		console.log('слишком мало валюты для покупки', this.btc_value + ' BTC');
		next(null);
		return;		
	}

	this.buyLimit(pair_name, buy_price.toFixed(8), value.toFixed(8), function (error, data) {
		console.log('DEBUG!!!', error, data);
		if (error) {
			console.log('Ошибка выставления ордера на покупку', error);
			next(null);
		} else {
			console.log('Выставлен ордер на покупку', pair_name, 'по цене', buy_price, '. Объем в валюте', buy_price * value);
			self.btc_value -= buy_price * value;
			self.baseConnector.saveOrder({
				exchangeId : data.exchangeId,
				currencyPair : pair_name,
				type : 'LIMIT_BUY',
				orderStatus : 'OPEN'
			}, function (err, data) {
				if (!err) console.log('Ордер сохранен в базу');
				else console.log('Ошибка сохранения в базу');

				next(null);
			});
		}

	});
}

TRADER.prototype.syncRemoteOrdersWithLocal = function (next) {
	var self = this;

	self.baseConnector.updateOpenOrders(self.closed_orders, function (err, data) {
		if (err) console.log('Ошибка синхронизации ордеров', err);
		else {
			console.log('Синхронизация успешно завершена');
		}
		next(null);
	})
}

// ГОТОВО !!!
// выставили ордер на покупку
// сохранили orderStatus = OPEN

// ГОТОВО !!!
// бежим по всем что сохранены опен
// если статус поменян то ставим orderStatus = EXECUTED
// бежим по всем открытым селл ордрам и смотрим закрылись ли они

// ГОТОВО !!!
// отменяем все выставленные на продажу, удаляем их из базы по ид

// 
// выставляем ордер на продажу сохраняем его в нем ид покупочного buyOrderId
// если квикселим то заменяем тот ордер новым оставляя buyOrderId



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
			bot.TRADERS[i].exchange.ok_rank_value = data.ok_rank_value;
			bot.TRADERS[i].exchange.ok_spread_value = data.ok_spread_value;
		}
	}
	res.json({
		success : true
	});
});

app.post('/removeOrder', function (req, res, next) {
	data = req.body;
	console.log(data);
	var trader = bot.TRADERS.filter(function (el) {
		return el.exchange.name == data.exchangeName
	})[0];

	trader.cancelLimit(data.currencyPair, data.exchangeId, function (err, data) {
		if (err) console.log(err);
		console.log(data);
		res.json(data);
	});
});

app.post('/checkCycle', function (req, res, next) {
	bot.checkCycle(function () {
		res.json({
			bot : bot
		});
	});
});

app.post('/toggleExchange', function (req, res, next) {
	data = req.body;

	var trader = bot.TRADERS.filter(function (el) {
		return el.exchange.name == data.exchangeName
	})[0];
	
	trader.active = !trader.active;

	res.json({
		success : true
	});

});

app.get('/log', function (req, res, next) {
    res.sendfile('out.log');
});


app.listen(port, function() {
    console.log('Node app is running on port', port);
});


var bot = new BOT();
bot.addToTraders('LiveCoin');
bot.addToTraders('Bittrex');
bot.addToTraders('Poloniex');

if (loopTradeOnStart) {
	bot.loopTradeCycle(function () {});
}