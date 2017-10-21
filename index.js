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
	}
}

app.engine('ejs', require('ejs-locals'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

app.use(express.static(path.join(__dirname, 'public')));

var _ = require('lodash');

var tradeMethods = require('./tradeMethods');

var connector__LiveCoin = require('./connectors/livecoin');

// var coinsLookup = ['STEEM', 'LSK', 'CRBIT', 'WAVES', 'GOLOS', 'MONA', 'LTC', 'CURE'];
var coinsLookup = ['MONA'];
// var coinsLookup = ['ETH'];
var coinsStr = coinsLookup.map(function(el) {
	return '^' + el +'/BTC$';
}).join('|');


var satoshi = 0.00000001;
var currenciesRankMap = {};

var getRank = function(ask, bid, volume24H) {
	return ((ask-bid)/bid) * volume24H;
}

var getInBTC = function(value, exchange_rate) {
	return value * exchange_rate;
}

var trader = new tradeMethods();
var exchange__LiveCoin = new connector__LiveCoin();

var btc_rur;
var GLOBAL__total_balances;
var GLOBAL__exchange_pairs;
var GLOBAL__tradeable_exchange_pairs;
var GLOBAL__available_balances;
var closed_orders_by_curr = {};
var closed_orders;
var open_buy_orders;
var open_sell_orders;
var closed_buy_orders;
var koef = 10;
var exchange_fee = 0.2;
var max_buy_order_price = 0.00015;
var open_sell_orders_by_curr = {};
var open_buy_orders_by_curr = {};
var closed_buy_orders_by_curr = {};
var able_to_sell_pairs;
var able_to_buy_pairs;
var interval;
var trade_cycle_time = 1000 * 60 * 5;

trader.useExchange(exchange__LiveCoin);

var loopTradeCycle = function (callback) {
	console.log('loopTradeCycle STARTED');

	run();
	interval = setInterval(run, trade_cycle_time);

	function run() {
		async.waterfall([
			checkCycle,
			tradeCycle
		], function (error, data) {
			console.log(data);
		});
	}

	callback('ok');
}

var stopLoopTradeCycle = function (callback) {
	console.log('loopTradeCycle STOPPED');
	clearInterval(interval);
	callback('ok');
}

var checkCycle = function (callback) {
	async.waterfall([
		getCurrenciesData,
		trader.wrapWait(getBalance),
		trader.wrapWait(getOrders),
	], function (error, pairs_data) {
		console.log('pairs_data', pairs_data);
		callback();
	});
}

var tradeCycle = function (callback) {

	makeBuyAndSellData();

	// console.log(able_to_buy_pairs.map(function (el) {
	// 	return [el.symbol];
	// }));
	// console.log(able_to_buy_pairs);
	// console.log(able_to_sell_pairs);

	async.waterfall([
		trader.wrapWait(cancelOpenBuyOrdersCycle, 2000, 2500),

		trader.wrapWait(getCurrenciesData, 2000, 2500),
		trader.wrapWait(getOrders, 2000, 2500),
		trader.wrapWait(makeBuyAndSellData, 2000, 2500),

		trader.wrapWait(sellCycle, 2000, 2500),
		trader.wrapWait(buyCycle, 2000, 2500),

		trader.wrapWait(checkCycle, 2000, 2500)
	], function (error, data) {
		console.log('trade ended');
	});

	callback();
}

function makeBuyAndSellData(next) {

	GLOBAL__tradeable_exchange_pairs = GLOBAL__exchange_pairs.filter(function (el) {
		return el.tradeable;
	});

	able_to_buy_pairs = GLOBAL__tradeable_exchange_pairs.map(function (el) {

		el.quantity = max_buy_order_price / el.best_ask;

		if (closed_orders_by_curr[el.symbol]) {
			el.success_counts = closed_orders_by_curr[el.symbol].filter(function (el) {
				return el.type == 'LIMIT_SELL';
			}).length;
		}
		if (open_sell_orders_by_curr[el.symbol]) {
			el.in_trade = open_sell_orders_by_curr[el.symbol] && open_sell_orders_by_curr[el.symbol].length;
		}

		return el;
	});

	able_to_buy_pairs = able_to_buy_pairs.filter(function (el) {
		return ((el.in_trade < 2 || !el.in_trade)
			&& el.success_counts > 0)
			|| (!el.success_counts && !el.in_trade)
	})
	.filter(function (el) {
		var value; 
		var currencyName = el.symbol.split('/')[0];
		var currency = GLOBAL__total_balances.filter(function (_curr) {
			return _curr.currency == currencyName;
		})[0];
		if (currency) {
			value = currency.value;
		}
		// return !open_buy_orders_by_curr[el.symbol] && !value;
		// return !open_buy_orders_by_curr[el.symbol];
		var _curr_arr = GLOBAL__available_balances.map(function (el) {
			return el.currency;
		}).filter(function (el) {
			return el != 'BTC';
		});

		return _curr_arr.indexOf(currencyName) == -1 && !open_buy_orders_by_curr[el.symbol] && el.rank >= 0.4;
	});


	able_to_sell_pairs = GLOBAL__available_balances.filter(function (el) {
		if (closed_buy_orders_by_curr[el.currency + '/BTC']) {
			el.buy_order = closed_buy_orders_by_curr[el.currency + '/BTC'].filter(function (_curr) {
				return _curr.quantity == el.value;
			})[0];
			if (!el.buy_order) {
				el.buy_order = closed_buy_orders_by_curr[el.currency + '/BTC'][0];
			}
		}

		return el.currency != 'BTC';
	});

	if (next) next();

}

function sellCycle(next) {
	console.log('sellCycle', able_to_sell_pairs.map(function (el) {
		return el.currency;
	}));

	async.eachSeries(able_to_sell_pairs, function (pair, serie_callback) {

		trader.wrapWait(sellEachPair.bind(null, pair, serie_callback), 2000, 2500)();
		
	}, function(error, data) {
		next(null);
	});
}

function sellEachPair(pair, next) {
	console.log(pair);
	if (!pair.buy_order) {
		next(null);
		return;
	}
	// var symbols_after_comma = pair.buy_order.price.toString().length - 2;
	var sell_price = (pair.buy_order.price / 100 * 106).toFixed(8);
	var pair_name = pair.currency + '/BTC';
	console.log('bought with', pair.buy_order.price);
	console.log('lets try sell with', sell_price, 'for inBTC',  sell_price * pair.value);
	console.log('pair_name', pair_name);
	trader.sellLimit(pair_name, sell_price, pair.value, function (data, error) {
		console.log(data, 'error', error);
		next(null);
	});
}

function cancelOpenBuyOrdersCycle(next) {
	console.log('cancelOpenBuyOrdersCycle pairs', open_buy_orders.length);

	async.eachSeries(open_buy_orders, function (order, serie_callback) {

		trader.wrapWait(cancelEachOrder.bind(null, order, serie_callback), 2000, 2500)();

	}, function (error, data) {
		next(null);
	});
}

function cancelEachOrder(order, next) {
	var id = order.id;
	var currencyPair = order.currencyPair;

	console.log('cancelEachOrder', id, currencyPair);

	trader.cancelLimit(currencyPair, id, function (data, error) {
		console.log(data, 'error', error);
		next(null);
	});
}

function buyCycle(next) {

	console.log('buyCycle', able_to_buy_pairs.map(function (el) {
		return el.symbol;
	}));

	var work_buy_pairs = able_to_buy_pairs.slice(0, 6);
	
	async.eachSeries(work_buy_pairs, function (pair, serie_callback) {

		trader.wrapWait(buyEachPair.bind(null, pair, serie_callback), 2000, 2500)();

	}, function (error, data) {
		next(null);
	});
}

function buyEachPair(pair, next) {
	var pair_name = pair.symbol;
	var buy_price = pair.best_bid;
	var value = (max_buy_order_price / buy_price).toFixed(8);

	console.log('buyEachPair', pair_name, buy_price, value);

	trader.buyLimit(pair_name, buy_price.toFixed(5), value, function (data, error) {
		console.log(data, 'error', error);
		next(null);
	});
}


function getCurrenciesData(next) {
	trader.getTicker(function(_exchange_pairs) {

		_exchange_pairs = _exchange_pairs.map(function(el) {
			el.rank = getRank(el.best_ask, el.best_bid, getInBTC(el.volume, el.best_ask));
			return el;
		});
		_exchange_pairs = _.sortBy(_exchange_pairs, ['rank']).reverse();

		btc_rur = _exchange_pairs.filter(function(el) {
			return el.symbol == 'BTC/RUR';
		})[0];

		GLOBAL__exchange_pairs = _exchange_pairs.filter(function(el) {
			if (el.volume * el.best_ask > 4) {
				el.tradeable = true;
			}
			return el.symbol.endsWith('/BTC') && el.rank > 0 && el.rank < 20 && isFinite(el.rank);
		});

		_exchange_pairs = null;

		next(null);
	});
}

function getBalance(next) {
	trader.getBalance({}, function (data) {
		GLOBAL__available_balances = data.available;
		GLOBAL__total_balances = data.total;

		GLOBAL__total_balances = GLOBAL__total_balances.map(function (balance_currency) {
			var _pair = GLOBAL__exchange_pairs.filter(function (pair) {
				return balance_currency.currency == pair.currency;
			});
			var _pair_best_ask_for_calc;
			if (_pair[0]) { 
				_pair_best_ask_for_calc = _pair[0].best_ask;
					balance_currency.inBTC = getInBTC(balance_currency.value, _pair_best_ask_for_calc);
					balance_currency.best_ask = _pair_best_ask_for_calc;
			 } else {
				balance_currency.inBTC = balance_currency.value;
			 }

			return balance_currency;
		});

		data = null;

		next(null);		
	});
}

function getOrders(next) {
	trader.getClientOrders({}, function (API_ORDERS) {
		
		open_sell_orders_by_curr = {};
		open_buy_orders_by_curr = {};
		closed_buy_orders_by_curr = {};
		closed_orders_by_curr = {};

		closed_orders = API_ORDERS.closed_orders;
		for (var k in closed_orders) {
			closed_orders_by_curr[closed_orders[k].currencyPair] = closed_orders_by_curr[closed_orders[k].currencyPair] || [];
			closed_orders_by_curr[closed_orders[k].currencyPair].push(closed_orders[k]);	
		}

		open_sell_orders = API_ORDERS.open_sell_orders;
		for (var i in open_sell_orders) {
			open_sell_orders_by_curr[open_sell_orders[i].currencyPair] = open_sell_orders_by_curr[open_sell_orders[i].currencyPair] || [];
			open_sell_orders_by_curr[open_sell_orders[i].currencyPair].push(open_sell_orders[i]);
		}

		open_buy_orders = API_ORDERS.open_buy_orders;
		for (var i in open_buy_orders) {
			open_buy_orders_by_curr[open_buy_orders[i].currencyPair] = open_buy_orders_by_curr[open_buy_orders[i].currencyPair] || [];
			open_buy_orders_by_curr[open_buy_orders[i].currencyPair].push(open_buy_orders[i]);
		}

		closed_buy_orders = API_ORDERS.closed_buy_orders;
		for (var i in closed_buy_orders) {
			closed_buy_orders_by_curr[closed_buy_orders[i].currencyPair] = closed_buy_orders_by_curr[closed_buy_orders[i].currencyPair] || [];
			closed_buy_orders_by_curr[closed_buy_orders[i].currencyPair].push(closed_buy_orders[i]);
		}

		GLOBAL__total_balances = GLOBAL__total_balances.map(function (el) {
			var _open_sell_orders = open_sell_orders_by_curr[el.currency + '/BTC'];
			var _open_buy_orders = open_buy_orders_by_curr[el.currency + '/BTC'];
			var _closed_buy_orders = closed_buy_orders_by_curr[el.currency + '/BTC'];

			if (_open_sell_orders) {
				el.order_pairs = [];
				for (var i in _open_sell_orders) {
					var _pair = {
						buy_order : _closed_buy_orders[i],
						sell_order : _open_sell_orders[i]
					}
					if (_open_buy_orders) {
						_pair.open_order = _open_buy_orders[i];
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

app.get('/', function (req, res, next) {
	res.render('index', {
		balances : GLOBAL__total_balances || [],
		closed_orders : closed_orders_by_curr,
		exchange_pairs : GLOBAL__exchange_pairs || [],
		max_buy_order_price : max_buy_order_price,
		btc_rur : btc_rur || {},
		open_buy_orders : open_buy_orders || []
	});
});

app.post('/getChartData', function (req, res, next) {
	trader.getChartData('m15', req.body.currencyPair, function (data) {
		res.json(data);
	});
});

app.post('/loopTradeCycle', function (req, res, next) {
	loopTradeCycle(function (data) {
		res.json('ok');
	});
});

app.post('/stopLoopTradeCycle', function (req, res, next) {
	stopLoopTradeCycle(function (data) {
		res.json('ok');
	});
});

app.post('/tradeCycle', function (req, res, next) {
	tradeCycle(function (data) {
		res.json(data);
	});
});

app.post('/checkCycle', function (req, res, next) {
	checkCycle(function () {
		res.json({
			balances : GLOBAL__total_balances,
			closed_orders : closed_orders_by_curr,
			exchange_pairs : GLOBAL__exchange_pairs,
			max_buy_order_price : max_buy_order_price,
			btc_rur : btc_rur,
			open_buy_orders : open_buy_orders
		});
	});
});

app.get('/log', function (req, res, next) {
    res.sendfile('out.log');
});

app.listen(port, function() {
    console.log('Node app is running on port', port);
});
