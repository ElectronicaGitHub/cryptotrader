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
var moment = require('moment');

var Rollbar = require("rollbar");
var rollbar = new Rollbar("d1f871271f6840859895328aa1b65114");

process.on('uncaughtException', function (err) {
	rollbar.error(err);
	console.log(err);
});

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

TRADER.pairs_graph_data = {};

TRADER.prototype.checkCycle = function (hasAnalyze, callback) {

	var self = this;

	if (!this.active) {
		console.log('Биржа неактивна', self.exchange.name);
		return callback();
	}

	console.log('Цикл проверки', this.exchange.name);

	fnArr = [
		self.getUserSummaries.bind(self),
		self.getUserBalances.bind(self),
		self.getUserOrders.bind(self),
		self.makeTradeData.bind(self),
		self.syncRemoteOrdersWithLocal.bind(self)
	]

	// if (hasAnalyze) {
	// 	fnArr.push(self.analyzeChartData.bind(self));
	// }

	async.waterfall(fnArr, function (error, pairs_data) {
		callback();
	});
}

TRADER.prototype.collectChartData = function (callback) {

	// console.log('Сбор данных рынка', this.exchange.name);

	var self = this;

	async.series([
		self.getUserSummaries.bind(self),
		self.baseConnector.updateChartData.bind(self)
	], function (err, result) {

		let data = result[1];

		let last_data_n = 60 * self.analyticsModule.params.graph_hours;

		for (var i in data) {
			data[i] = data[i].slice(data[i].length - last_data_n);	
		}
		self.pairs_graph_data = data;

		callback();
	});
}

// TRADER.prototype.checkBaseToFiatTrend = function (callback) {}

TRADER.prototype.analyzeChartData = function(callback) {

	console.log('Начат анализ данных');

	var self = this;

	var data = this.baseConnector.getChartData(function (err, data) {

		let last_data_n = 60 * self.analyticsModule.params.graph_hours;

		for (var i in data) {
			data[i] = data[i].slice(data[i].length - last_data_n);
		}

		self.pairs_graph_data = data;

		for (let pair of self.able_to_buy_pairs) {
			pair.analyticsResult = self.analyticsModule.analyze(self, pair);
		}

		// сохраняем analyticsResult в pair
		// что и за какую цену и ситуацию на рынке было куплено

		// self.analyticsModule.setParams(params);

		callback();
	});
}

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

		// self.lastBaseToFiatChart = data;

		if (!data) {
			isRaising = false;
		} else {
			arr = data.slice(data.length - 4);
			console.log('Проверка тренда торгуемой валюты к фиату', self.exchange.name);
			console.log('15м назад:', arr[0][check_parameter], 
						'10м назад:', arr[1][check_parameter], 
						'5м назад:', arr[2][check_parameter], 
						'Текущее значение:', arr[3][check_parameter]
			);
			raisingValue = arr[3][check_parameter] - arr[0][check_parameter];
			isRaising = raisingValue > 0;
		}

		if (isRaising && ((raisingValue/arr[3][check_parameter]) >= self.exchange.base_currency_diff_value)) {

			console.log('Валюта растет: Продаем все пары');
			async.series([
				self.sellCycle.bind(self),
				self.stopLossCycle.bind(self),
				self.checkCycle.bind(self, true),
				
				// self.closeOpenSellOrders.bind(self),
				// self.checkCycle.bind(self),
				// self.quickSellCycle.bind(self),
			], function (err, data) {
				console.log('Торговый цикл завершен');
				callback();
			});

		} else {

			console.log('Валюта падает: Стандартный прогон');
			async.series([
				// отмена открытых покупок
				self.cancelOpenBuyOrdersCycle.bind(self),
				self.wrapWait(self.checkCycle.bind(self, false)),

				// нормализация невалидных к сделкам балансов
				self.normalizeBalances.bind(self),
				self.wrapWait(self.checkCycle.bind(self, false)),

				self.sellCycle.bind(self),
				self.buyCycle.bind(self),

				self.stopLossCycle.bind(self),
				self.checkCycle.bind(self, true)

			], function (error, data) {
				console.log('Торговый цикл завершен');
				callback();
			});
		}
	});

}

TRADER.prototype.getUserOrders = function (next) {
	var self = this;
	this.getOrders({}, function (API_ORDERS) {

		// a = API_ORDERS
		// .filter(function (el) {
		// 	return el.currencyPair == 'CLAM/BTC';
		// 	// return el.currencyPair == 'CLAM/BTC' || el.currencyPair == 'EXP/BTC';
		// })
		// .map(function (el) {
		// 	return [el.orderStatus, el.type, el.quantity, el.lastModificationTime];
		// });

		// a = _.sortBy(a, ['lastModificationTime']).reverse();
		// console.log(a);

		// console.log(API_ORDERS.filter(el => el.currencyPair == 'VTC/BTC' && el.type == 'LIMIT_SELL').map(el => [el.exchangeId, el.quantity]));

		self.baseConnector.findOrders({}, (err, ORDERS_FROM_BASE) => {

			var ORDERS = _(ORDERS_FROM_BASE)
				.concat(API_ORDERS)
				.groupBy("exchangeId")
				.map(_.spread(_.merge))
				.value();

			ORDERS = ORDERS.filter(el => moment(el.lastModificationTime).isSameOrAfter(moment().subtract(2, 'd'), 'd'));

			self.open_sell_orders = ORDERS.filter(el => {
				return el.type == 'LIMIT_SELL' && el.orderStatus == 'OPEN';
			});
			self.open_buy_orders = ORDERS.filter(el => {
				return el.type == 'LIMIT_BUY' && el.orderStatus == 'OPEN';
			});
			self.closed_buy_orders = ORDERS.filter(el => {
				return el.type == 'LIMIT_BUY' && (el.orderStatus == 'EXECUTED' || el.orderStatus == 'PARTIALLY_FILLED_AND_CANCELLED');
			});
			self.closed_orders = ORDERS.filter(el => {
				return (el.orderStatus == 'EXECUTED' || el.orderStatus == 'PARTIALLY_FILLED_AND_CANCELLED');
			});

			// console.log(self.closed_orders.filter(el => el.currencyPair == 'VTC/BTC' && el.type == 'LIMIT_SELL').map(el => [el.exchangeId, el.quantity]));

			self.open_sell_orders_by_curr = {};
			self.open_buy_orders_by_curr = {};
			self.closed_buy_orders_by_curr = {};
			self.closed_orders_by_curr = {};

			for (let closed_order of self.closed_orders) {
				self.closed_orders_by_curr[closed_order.currencyPair] = self.closed_orders_by_curr[closed_order.currencyPair] || [];
				self.closed_orders_by_curr[closed_order.currencyPair].push(closed_order);	
			}

			for (let open_sell_order of self.open_sell_orders) {
				self.open_sell_orders_by_curr[open_sell_order.currencyPair] = self.open_sell_orders_by_curr[open_sell_order.currencyPair] || [];
				self.open_sell_orders_by_curr[open_sell_order.currencyPair].push(open_sell_order);
			}

			for (let open_buy_order of self.open_buy_orders) {
				self.open_buy_orders_by_curr[open_buy_order.currencyPair] = self.open_buy_orders_by_curr[open_buy_order.currencyPair] || [];
				self.open_buy_orders_by_curr[open_buy_order.currencyPair].push(open_buy_order);
			}

			for (let closed_buy_order of self.closed_buy_orders) {
				self.closed_buy_orders_by_curr[closed_buy_order.currencyPair] = self.closed_buy_orders_by_curr[closed_buy_order.currencyPair] || [];
				self.closed_buy_orders_by_curr[closed_buy_order.currencyPair].push(closed_buy_order);
			}

			self.total_balances = self.total_balances.map(el => {

				let open_sell_orders = self.open_sell_orders_by_curr[el.currency + '/BTC'];

				if (open_sell_orders) {
					
					el.order_pairs = [];

					for (let open_sell_order of open_sell_orders) {

						let pair = {
							sell_order : open_sell_order
						};
						// берем закрытые покупочные ордера
						let closed_buy_orders = self.closed_buy_orders_by_curr[el.currency + '/BTC'];
						
						if (closed_buy_orders) {
							let filtered = closed_buy_orders.filter(el => el.lastModificationTime < open_sell_order.lastModificationTime);
							pair.buy_order = _.sortBy(filtered).reverse()[0];
						}

						el.order_pairs.push(pair);
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
		
		self.total_balances = data.total.map(function (balance_currency) {
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

		self.available_balances = data.available.map(function (balance_currency) {
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

TRADER.prototype.closeOpenSellOrders = function (callback) {

	console.log('Цикл закрытия ордеров');

	var orders_to_close = [];
	for (var i in this.open_sell_orders) {
		var each_open_sell_order = this.open_sell_orders[i];
		orders_to_close.push({
			exchangeId : each_open_sell_order.exchangeId, 
			currencyPair : each_open_sell_order.currencyPair, 
		});
	}

	console.log('Ордера на закрытие', orders_to_close);

	async.eachSeries(orders_to_close, function (order, serie_callback) {
		self.wrapWait(self.cancelOrder.bind(self, order, serie_callback))();
	}, function (err, data) {
		callback();
	});
}

TRADER.prototype.stopLossCycle = function (callback) {

	console.log('Цикл стоп-лосс продаж:', this.exchange.name); 

	let self = this;

	for ( let i in this.open_sell_orders) {
		let each_open_sell_order = this.open_sell_orders[i];

		let closed_buy_orders = self.closed_buy_orders_by_curr[each_open_sell_order.currencyPair];
		if (closed_buy_orders) {
			each_open_sell_order.buy_order = _.sortBy(closed_buy_orders, ['lastModificationTime']).reverse()[0];
		}
		let currency = this.total_balances.filter(function (el) {
			return each_open_sell_order.currencyPair.split('/')[0] == el.currency;
		})[0];

		if (each_open_sell_order.buy_order && currency) {
			// если в покупном ордере есть аналитика и стоп лосс цена
			if (each_open_sell_order.buy_order.analyticsResult && 
				each_open_sell_order.buy_order.analyticsResult.values.stop_loss_price) {
				// то сравниваем цену
				each_open_sell_order.is_sellable = (currency.best_ask <= each_open_sell_order.buy_order.analyticsResult.values.stop_loss_price);
			} else {
				// иначе смотрим стандартно через стоп-лосс коэффициент
				let diff = (currency.best_ask * each_open_sell_order.buy_order.quantity) - each_open_sell_order.buy_order.inBTC;
				let diff_perc = (diff / each_open_sell_order.buy_order.inBTC) * 100;
				each_open_sell_order.is_sellable = (diff_perc < -this.exchange.stop_loss_koef);
			}
		}
	}

	let stop_loss_orders_can_sell = this.open_sell_orders
		.filter(el => el.is_sellable);

	console.log('Ордера:', stop_loss_orders_can_sell.map(function (el) {
		return el.currencyPair;
	}));

	if (!stop_loss_orders_can_sell.length) {
		callback();
		return;
	}

	async.eachSeries(stop_loss_orders_can_sell, function (order, serie_callback) {

		async.series([
			self.cancelOrder.bind(self, order),
			self.wrapWait(self.sellPair.bind(
				self, 
				order.currencyPair,
				order.quantity,
				order.buy_order,
				'stop_loss'
			))
		], function (err, data) {
			serie_callback();
		});
		
	}, function (err, data) {
		callback();
	});
}

TRADER.prototype.normalizeBalances = function (next) {
	console.log('Нормализация недостающего баланса');

	var need_to_buy_currencies = self.available_balances.filter(function (el) {
		return el.currency != 'BTC';	
	})
	.filter(function (el) {
		return el.value * el.best_ask <= self.exchange.min_buy_order_price;
	});

	console.log('Нужно докупить', need_to_buy_currencies.map(function (el) {
		return [el.currency, el.value * el.best_ask]
	}));

	async.eachSeries(need_to_buy_currencies, function (pair, serie_callback) {

		self.wrapWait(self.buyPair.bind(self, pair, serie_callback))();

	}, function (error, data) {
		next(null);
	});
	// next(null);
}

TRADER.prototype.makeTradeData = function (next) {

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

	self.able_to_buy_pairs = self.able_to_buy_pairs
	// .filter(function (el) {
	// 	return el.success_counts > 0 || (!el.success_counts && !el.in_trade);
	// })
	.filter(function (el) {
		return el.in_trade < 1 || !el.in_trade;
	})
	// .filter(function (el) {
	// 	return el.rank >= self.exchange.ok_rank_value && isFinite(el.rank);
	// })
	// (!!!)
	.filter(function (el) {
		return isFinite(el.rank);
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

		var _curr_arr = self.available_balances.map(function (el) {
			return el.currency;
		}).filter(function (el) {
			return el != 'BTC';
		});

		return _curr_arr.indexOf(currencyName) == -1 && !self.open_buy_orders_by_curr[el.symbol];
	});

	// Бежим по балансу и продаем значения
	self.able_to_sell_pairs = self.available_balances.filter(function (el) {

		let closed_buy_orders = self.closed_buy_orders_by_curr[el.currency + '/BTC'];

		if (closed_buy_orders) {

			// el.buy_order = closed_buy_orders.filter(curr => curr.quantity == el.value)[0];
			// if (!el.buy_order) {
			el.buy_order = _.sortBy(closed_buy_orders, ['lastModificationTime']).reverse()[0];
			// }
		}

		return el.currency != 'BTC';
	});

	// Тех Анализ
	self.analyzeChartData(function (err, data) {
		if (next) next();
	});
}

// TRADER.prototype.quickSellCycle = function (next) {

// 	var self = this;

// 	console.log('Цикл быстрых продаж', this.able_to_sell_pairs.map(function (el) {
// 		return el.currency;
// 	}));

// 	async.eachSeries(self.able_to_sell_pairs, function (pair, serie_callback) {

// 		self.wrapWait(self.sellPair.bind(
// 			self, 
// 			pair.currency, 
// 			pair.value, 
// 			null, 
// 			'quick_sell', 
// 			serie_callback)
// 		)();
		
// 	}, function(error, data) {
// 		next(null);
// 	});
// }

TRADER.prototype.sellCycle = function (next) {

	var self = this;

	console.log('Цикл продаж', this.able_to_sell_pairs.map(function (el) {
		return el.currency;
	}));

	async.eachSeries(self.able_to_sell_pairs, function (pair, serie_callback) {

		self.wrapWait(self.sellPair.bind(
			self, 
			pair.currency, 
			pair.value, 
			pair.buy_order,
			false, 
			serie_callback)
		)();
		
	}, function(error, data) {
		next(null);
	});
}

TRADER.prototype.calculateSellPrice = function (currency, buy_order, quantity, quick_sell) {

	var sell_price;

	if (quick_sell) {
		// быстрая продажа, продаем по рынку
		var currency = this.total_balances.filter(function (el) { return currency == el.currency; })[0];
		sell_price = +currency.best_ask + satoshi;
	} else {
		// продаем с профитом
		var tax = (buy_order.price * quantity) * ( 2 * this.exchange.exchange_fee);
		var price_in_btc = buy_order.price * quantity; // понимаем цену в битках
		var profit_price_in_btc = (price_in_btc * (100 + +this.exchange.profit_koef) / 100) + tax;

		sell_price = profit_price_in_btc / quantity;
	}

	// if (sell_price * pair.value < this.exchange.max_buy_order_price) {
	// 	sell_price = this.exchange.max_buy_order_price / pair.value;
	// }

	return +sell_price;
}

TRADER.prototype.sellPair = function (currency, quantity, buy_order, quick_sell, next) {
	let self = this;
	let currency_pair = currency.indexOf('/') < 0 ? (currency + '/BTC') : currency;
	currency = currency_pair.split('/')[0];
	let reason = quick_sell ? quick_sell : 'profit_sell';
	let sell_price;

	console.log('Продажа пары ' + (quick_sell ? 'по рынку' : 'с профитом'));

	if (!buy_order && !quick_sell) {
		console.log('Пара', currency_pair, 'без ордера на покупку');
		next(null);
		return;
	}

	if (buy_order && buy_order.analyticsResult) {
		console.log('Ордер содержит данные аналитики');
		if (reason == 'profit_sell') {
			sell_price = buy_order.analyticsResult.values.sell_price;
		} else if (reason == 'stop_loss') {
			sell_price = buy_order.analyticsResult.values.stop_loss_price;
		}
	} else {
		console.log('Ордер не содержит данных аналитики');
		sell_price = self.calculateSellPrice(currency, buy_order, quantity, quick_sell);
	}

	console.log('Выставляем ордер на продажу', currency, 'в кол-ве', quantity, 'по цене', sell_price, 'В BTC', quantity * sell_price);

	this.sellLimit(currency_pair, sell_price.toFixed(8), quantity, function (error, data) {
		// console.log('DEBUG !!!', error, data);
		if (error) {
			console.log('Ошибка выставления ордера на продажу', error);
			next(null);
			return;
		} else {
			console.log('Ордер на продажу успешно выставлен', currency_pair, 'по цене', sell_price);
			self.baseConnector.saveOrder({
				exchangeId : data.exchangeId,
				currencyPair : currency_pair,
				type : 'LIMIT_SELL',
				reason : reason,
				orderStatus : 'OPEN'
			}, function (err, data) {
				if (!err) console.log('Ордер сохранен в базу');
				else console.log('Ошибка сохранения в базу');

				next(null);
			});		
		}
	});
}

TRADER.prototype.cancelOpenBuyOrdersCycle = function (next) {

	var self = this;

	console.log('Цикл отмены открытых покупок', this.open_buy_orders.length);

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

	console.log('Отмена ордера', id, currencyPair);

	this.cancelLimit(currencyPair, id, function (error, data) {
		console.log('DEBUG!!!', error, data);
		if (error) {
			console.log('Ошибка отмены ордера');
		}
		self.baseConnector.removeOrder(order.exchangeId, function (err, data) {
			if (!err) console.log('Ордер успешно удален');
			else console.log('Ошибка отмены ордера', err);

			next();
		});
	});
}

TRADER.prototype.buyCycle = function (next) {

	var self = this;

	this.btc_value = this.available_balances.filter(function (el) {
		return el.currency == 'BTC';
	})[0].value;

	if (this.btc_value < this.exchange.max_buy_order_price) {
		console.log('Недостаточно денег на балансе', this.btc_value + ' BTC');
		next(null);
		return;		
	}

	var work_buy_pairs = this.able_to_buy_pairs.filter(el => el.is_pair_acceptable);

	console.log('Цикл покупки', this.btc_value, work_buy_pairs.map(function (el) {
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
	var pair_name = pair.symbol || pair.currency + '/BTC';
	var buy_price = +pair.best_ask + satoshi;
	var quantity = +((this.exchange.max_buy_order_price * 101 / 100) / buy_price);

	if (this.btc_value < self.exchange.max_buy_order_price) {
		console.log('Cлишком мало валюты для покупки', this.btc_value + ' BTC');
		next(null);
		return;		
	}

	console.log('Покупка валюты', pair_name);

	this.buyLimit(pair_name, buy_price.toFixed(8), quantity, function (error, data) {
		console.log('DEBUG!!!', error, data);
		if (error) {
			console.log('Ошибка выставления ордера на покупку', error);
			next(null);
		} else {
			console.log('Выставлен ордер на покупку', pair_name, 'по цене', buy_price, '. Объем в валюте', buy_price * quantity);
			self.btc_value -= buy_price * quantity;
			self.baseConnector.saveOrder({
				exchangeId : data.exchangeId,
				currencyPair : pair_name,
				type : 'LIMIT_BUY',
				orderStatus : 'OPEN',
				analyticsResult : pair.analyticsResult,
				analyticsParams : self.analyticsModule.params,
				buyMomentChartData : pair.buyMomentChartData
			}, function (err, data) {
				if (!err) console.log('Ордер сохранен в базу');
				else console.log('Ошибка сохранения в базу');

				next(null);
			});
		}

	});
}

TRADER.prototype.syncRemoteOrdersWithLocal = function (next) {
	console.log('Начата синхронизация ордеров');
	var self = this;

	self.baseConnector.updateOpenOrders(self.closed_orders, function (err, data) {
		if (err) console.log('Ошибка синхронизации ордеров', err);
		else {
			console.log('Синхронизация успешно завершена');
		}
		next(null);
	})
}

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

app.post('/saveTraderAnalyticsChanges', function (req, res ,next) {
	data = req.body;

	for (var i in bot.TRADERS) {
		if (bot.TRADERS[i].exchange.name == data.name) {
			bot.TRADERS[i].analyticsModule.setParams(data.params);
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

	trader.cancelOrder(data, function (err, data) {
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

app.use(rollbar.errorHandler());

app.listen(port, function() {
    console.log('Node app is running on port', port);
});


var bot = new BOT();
// bot.addToTraders('LiveCoin');
bot.addToTraders('Bittrex');
bot.addToTraders('Poloniex');

if (loopTradeOnStart) {
	bot.loopTradeCycle(function () {});
}
bot.loopCollectChartData(function () {});