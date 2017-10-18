var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var log = require('./configs/logger')(module);
var fs = require('fs');
var async = require('async');
var app = express();

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
var GLOBAL__balances;
var GLOBAL__exchange_pairs;
var GLOBAL__tradeable_exchange_pairs;
var GLOBAL_available_balances;
var closed_orders = {};
var buy_orders;
var open_buy_orders;
var sell_orders;
var closed_buy_orders;
var koef = 10;
var exchange_fee = 0.2;
var max_buy_order_price = 0.00015;
var sell_orders_by_curr = {};
var buy_orders_by_curr = {};
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
		getPairsData,
		trader.wrapWait(getBalance),
		trader.wrapWait(getOrders)
	], function (error, pairs_data) {
		console.log('pairs_data', pairs_data);
		callback();
	});
}

var tradeCycle = function (callback) {

	GLOBAL__tradeable_exchange_pairs = GLOBAL__exchange_pairs.filter(function (el) {
		return el.tradeable;
	});

	able_to_buy_pairs = GLOBAL__tradeable_exchange_pairs.map(function (el) {
		var our_ask_price = (el.best_ask * (100 + exchange_fee) / 100) * ((100 + koef) / 100) / 100 * (100 + exchange_fee);
		var quantity = max_buy_order_price / el.best_ask;

		ret = { 
			symbol : el.symbol,
			best_ask : el.best_ask,
			best_bid : el.best_bid,
			our_ask_price : our_ask_price,
			profit : quantity * (our_ask_price - el.best_ask),
			profitInRUR : quantity * (our_ask_price - el.best_ask) * btc_rur.best_ask + ' RUR',
			quantity : quantity,
			rank: el.rank
		}

		if (closed_orders[el.symbol]) {
			ret.success_counts = closed_orders[el.symbol].filter(function (el) {
				return el.type == 'LIMIT_SELL';
			}).length;
		}
		if (sell_orders_by_curr[el.symbol]) {
			ret.in_trade = sell_orders_by_curr[el.symbol] && sell_orders_by_curr[el.symbol].length;
		}

		return ret;
	});

	able_to_buy_pairs = able_to_buy_pairs.filter(function (el) {
		return ((el.in_trade < 2 || !el.in_trade)
			&& el.success_counts > 0)
			|| (!el.success_counts && !el.in_trade)
	})
	.filter(function (el) {
		var value; 
		var currencyName = el.symbol.split('/')[0];
		var currency = GLOBAL__balances.filter(function (_curr) {
			return _curr.currency == currencyName;
		})[0];
		if (currency) {
			value = currency.value;
		}
		// return !open_buy_orders_by_curr[el.symbol] && !value;
		// return !open_buy_orders_by_curr[el.symbol];
		var _curr_arr = GLOBAL_available_balances.map(function (el) {
			return el.currency;
		}).filter(function (el) {
			return el != 'BTC';
		});

		return _curr_arr.indexOf(currencyName) == -1 && !open_buy_orders_by_curr[el.symbol] && el.rank >= 0.4;
	});


	able_to_sell_pairs = GLOBAL_available_balances.filter(function (el) {
		if (closed_buy_orders_by_curr[el.currency + '/BTC']) {
			console.log(closed_buy_orders_by_curr[el.currency + '/BTC']);
			el.buy_order = closed_buy_orders_by_curr[el.currency + '/BTC'].filter(function (_curr) {
				return _curr.quantity == el.value;
			})[0];
			if (!el.buy_order) {
				el.buy_order = closed_buy_orders_by_curr[el.currency + '/BTC'][0];
			}
		}

		return el.currency != 'BTC';
	});

	console.log(able_to_buy_pairs.map(function (el) {
		return [el.symbol];
	}));
	// console.log(able_to_buy_pairs);
	// console.log(able_to_sell_pairs);

	async.waterfall([
		trader.wrapWait(sellCycle, 2000, 2500),
		trader.wrapWait(buyCycle, 2000, 2500)
	], function (error, data) {
		console.log('trade ended', data);
	});

	callback();
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
	// console.log('buyEachPair', pair);
	// var sell_price = pair.buy_order.price / 100 * 106;
	var pair_name = pair.symbol;
	var buy_price = pair.best_bid;

	var value = (max_buy_order_price / buy_price).toFixed(8);
	// console.log('bought with', pair.buy_order.price);
	// console.log('lets try sell with', sell_price, 'for inBTC',  sell_price * pair.value);
	// console.log('pair_name', pair_name);
	console.log('buyEachPair', pair_name, buy_price, value);
	trader.buyLimit(pair_name, buy_price.toFixed(5), value, function (data, error) {
		console.log(data, 'error', error);
		next(null);
	});
	// next(null);
}

function getPairsData(next) {
	trader.getTicker(function(exchange_pairs) {

		exchange_pairs = exchange_pairs.map(function(el) {
			el.rank = getRank(el.best_ask, el.best_bid, getInBTC(el.volume, el.best_ask));
			el.spread = el.min_ask - el.max_bid;
			el.spread_rel = (el.min_ask - el.max_bid)/el.max_bid;
			el.our_ask_price = (el.best_ask * (100 + exchange_fee) / 100) * ((100 + koef) / 100) / 100 * (100 + exchange_fee);
			return el;
		});

		exchange_pairs = _.sortBy(exchange_pairs, ['rank']).reverse();

		btc_rur = exchange_pairs.filter(function(el) {
			return el.symbol == 'BTC/RUR';
		})[0];

		GLOBAL__exchange_pairs = exchange_pairs.filter(function(el) {
			if (el.volume * el.best_ask > 4) {
				el.tradeable = true;
			}
			return el.symbol.endsWith('/BTC') && el.rank > 0 && el.rank < 20 && isFinite(el.rank);
		})
		// .filter(function (el) {
		// 	return el.rank > 0.2;
		// });

		next(null);
	});
}

function getBalance(next) {
	trader.getBalance({}, function (data) {
		GLOBAL_available_balances = data.filter(function (el) {
			return el.value != 0 && (el.type == 'available');
		});
		GLOBAL__balances = data.filter(function (el) {
			return el.value != 0 && (el.type == 'total');
		});

		GLOBAL__balances = GLOBAL__balances.map(function (balance_currency) {
			var a = GLOBAL__exchange_pairs.filter(function (pair) {
				return balance_currency.currency == pair.cur;
			});
			var b = a[0]; var c;
			if (b) { 
				c = b.best_ask;
					balance_currency.inBTC = getInBTC(balance_currency.value, c);
					balance_currency.best_ask = c;
			 } else {
				balance_currency.inBTC = balance_currency.value;
			 }

			return balance_currency;
		});

		next(null);		
	});
}

function getOrders(next) {
	trader.getClientOrders({}, function (API_ORDERS) {
		sell_orders = API_ORDERS.data.filter(function (el) {
			return el.type == 'LIMIT_SELL' && el.orderStatus == 'OPEN';
		});
		_closed_orders = API_ORDERS.data.filter(function (el) {
			return el.orderStatus == 'EXECUTED';
		});
		buy_orders = API_ORDERS.data.filter(function (el) {
			return el.type == 'LIMIT_BUY' && el.orderStatus == 'EXECUTED';
		});
		open_buy_orders = API_ORDERS.data.filter(function (el) {
			return el.type == 'LIMIT_BUY' && el.orderStatus == 'OPEN';
		});
		closed_buy_orders = API_ORDERS.data.filter(function (el) {
			return el.type == 'LIMIT_BUY' && el.orderStatus == 'EXECUTED';
		});

		closed_orders = {};
		sell_orders_by_curr = {};
		buy_orders_by_curr = {};
		open_buy_orders_by_curr = {};
		closed_buy_orders_by_curr = {};

		for (var i in sell_orders) {
			sell_orders_by_curr[sell_orders[i].currencyPair] = sell_orders_by_curr[sell_orders[i].currencyPair] || [];
			sell_orders_by_curr[sell_orders[i].currencyPair].push({
				quantity : sell_orders[i].quantity,
				price : sell_orders[i].price,
				inBTC : sell_orders[i].quantity * sell_orders[i].price,
				lastModificationTime : sell_orders[i].lastModificationTime
			});
		}

		for (var i in open_buy_orders) {
			open_buy_orders_by_curr[open_buy_orders[i].currencyPair] = open_buy_orders_by_curr[open_buy_orders[i].currencyPair] || [];
			open_buy_orders_by_curr[open_buy_orders[i].currencyPair].push({
				quantity : open_buy_orders[i].quantity,
				price : open_buy_orders[i].price,
				inBTC : open_buy_orders[i].quantity * open_buy_orders[i].price,
				lastModificationTime : open_buy_orders[i].lastModificationTime
			});
		}

		for (var i in closed_buy_orders) {
			closed_buy_orders_by_curr[closed_buy_orders[i].currencyPair] = closed_buy_orders_by_curr[closed_buy_orders[i].currencyPair] || [];
			closed_buy_orders_by_curr[closed_buy_orders[i].currencyPair].push({
				quantity : closed_buy_orders[i].quantity,
				price : closed_buy_orders[i].price,
				inBTC : closed_buy_orders[i].quantity * closed_buy_orders[i].price,
				lastModificationTime : closed_buy_orders[i].lastModificationTime
			});
		}

		for (var i in buy_orders) {
			buy_orders_by_curr[buy_orders[i].currencyPair] = buy_orders_by_curr[buy_orders[i].currencyPair] || [];
			var new_buy_order = buy_orders[i];
			new_buy_order.inBTC = buy_orders[i].quantity * buy_orders[i].price;

			buy_orders_by_curr[buy_orders[i].currencyPair].push(new_buy_order);
		}

		GLOBAL__balances = GLOBAL__balances.map(function (el) {
			var _sell_orders = sell_orders_by_curr[el.currency + '/BTC'];
			var _buy_orders = buy_orders_by_curr[el.currency + '/BTC'];
			var _open_buy_orders = open_buy_orders_by_curr[el.currency + '/BTC'];

			if (_sell_orders) {
				el.order_pairs = [];
				for (var i in _sell_orders) {
					var _pair = {
						buy_order : _buy_orders[i],
						sell_order : _sell_orders[i]
					}
					if (_open_buy_orders) {
						_pair.open_order = _open_buy_orders[i];
					}
					el.order_pairs.push(_pair);
				}
			}
			return el;
		});

		for (var k in _closed_orders) {
			closed_orders[_closed_orders[k].currencyPair] = closed_orders[_closed_orders[k].currencyPair] || [];
			closed_orders[_closed_orders[k].currencyPair].push({
				currencyPair : _closed_orders[k].currencyPair,
				quantity : _closed_orders[k].quantity,
				price : _closed_orders[k].price,
				type : _closed_orders[k].type,
				inBTC : _closed_orders[k].quantity * _closed_orders[k].price,
				lastModificationTime : _closed_orders[k].lastModificationTime
			});	
		}

		next(null);
	});
}

// авторизация
// запрашиваем наши открытые ордера
// закрываем открытые ордера


// запрос баланса
// выгодно ли нам выставить наш купленный актив по рынку маржа процент + биржа ~0.4% ?
// да  => то выставляем его с лучшим ask
// нет => прошло ли время что его уже можно продать как провальный?
//     да  => продаем лучшим ask
//     нет => ждём

// получаем ранк по парам
// составляем список тех чем можно банчить вообще
// выставляем лимитный на покупку этих пар с лучшим bid


app.get('/', function (req, res, next) {
	res.render('index', {balances : GLOBAL__balances, btc_rur : btc_rur});
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
			balances : GLOBAL__balances,
			closed_orders : closed_orders,
			exchange_pairs : GLOBAL__exchange_pairs,
			max_buy_order_price : max_buy_order_price,
			btc_rur : btc_rur,
			open_buy_orders : open_buy_orders
		});
	});
});

app.listen(port, function() {
    console.log('Node app is running on port', port);
});
