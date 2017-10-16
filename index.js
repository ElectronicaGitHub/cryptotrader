var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var log = require('./configs/logger')(module);
var fs = require('fs');
var async = require('async');
var app = express();

var port = process.env.PORT || 8080;

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

var GLOBAL__balances;
var btc_rur;
var GLOBAL__exchange_pairs;
var closed_pairs = {};
var closed_orders;
var buy_orders;
var koef = 2;
var exchange_fee = 0.2;

trader.useExchange(exchange__LiveCoin);

var tradeCycle = function (callback) {
	async.waterfall([
		trader.wrapWait(getPairsData),
		trader.wrapWait(getBalance),
		trader.wrapWait(getOrders)
	], function (error, pairs_data) {
		console.log('pairs_data', pairs_data);
		callback();
	});
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
		});

		next(null);
	});
}

function getBalance(next) {
	trader.getBalance({}, function (data) {
		GLOBAL__balances = data.filter(function (el) {
			return el.value != 0 && el.type == 'total';
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
		closed_orders = API_ORDERS.data.filter(function (el) {
			return el.orderStatus == 'EXECUTED';
		});
		buy_orders = API_ORDERS.data.filter(function (el) {
			return el.type == 'LIMIT_BUY' && el.orderStatus == 'EXECUTED';
		});
		closed_pairs = {};

		var sell_orders_by_curr = {};
		var buy_orders_by_curr = {};

		for (var i in sell_orders) {
			sell_orders_by_curr[sell_orders[i].currencyPair] = sell_orders_by_curr[sell_orders[i].currencyPair] || [];
			sell_orders_by_curr[sell_orders[i].currencyPair].push({
				quantity : sell_orders[i].quantity,
				price : sell_orders[i].price,
				inBTC : sell_orders[i].quantity * sell_orders[i].price,
				lastModificationTime : sell_orders[i].lastModificationTime
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
			if (_sell_orders) {
				el.order_pairs = [];
				for (var i in _sell_orders) {
					el.order_pairs.push({
						buy_order : _buy_orders[i],
						sell_order : _sell_orders[i]
					});
				}
			}
			return el;
		});

		for (var k in closed_orders) {
			closed_pairs[closed_orders[k].currencyPair] = closed_pairs[closed_orders[k].currencyPair] || [];
			closed_pairs[closed_orders[k].currencyPair].push({
				currencyPair : closed_orders[k].currencyPair,
				quantity : closed_orders[k].quantity,
				price : closed_orders[k].price,
				type : closed_orders[k].type,
				inBTC : closed_orders[k].quantity * closed_orders[k].price,
				lastModificationTime : closed_orders[k].lastModificationTime
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

app.post('/cycle', function (req, res, next) {
	tradeCycle(function () {
		res.json({
			balances : GLOBAL__balances,
			closed_pairs : closed_pairs,
			exchange_pairs : GLOBAL__exchange_pairs.filter(function (el) {
				return el.rank > 0.2;
			}),
			btc_rur : btc_rur,
		});
	});
});

app.listen(port, function() {
    console.log('Node app is running on port', port);
});
