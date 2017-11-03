var bittrexAPI = require('node-bittrex-api');
var async = require('async');
var unirest = require('unirest');

function Bittrex() {

	var self = this;

	this.name = 'Bittrex';

	this.key = 'f791e840f2474fa9a6c81265f21b9c87'; // Api-key
	this.secretKey = 'cb96f00f09c64f239d9d9d3de2933218'; // Sign

	bittrexAPI.options({
	  'apikey' : this.key,
	  'apisecret' : this.secretKey,
	});

	this.usdName = 'USDT';
	this.min_buy_order_price = 0.0005;
	this.max_buy_order_price = 0.0006;
	this.stop_loss_koef = 5;
	this.profit_koef = 3;
	this.ok_rank_value = 0.7;
	this.min_req_interval = 300;
	this.max_req_interval = 500
	this.ok_spread_value = 0.4;
	this.exchange_fee = 0.0025;
	this.base_currency_diff_value = 0.004;

	this.formatter = {
		makeCurrencyName : function (currencyName) {
			currencyName = currencyName.split('/')
			return currencyName[1] + '-' + currencyName[0];
		}
	}

	this.methods = {
		getTicker : function (callback) {
			bittrexAPI.getmarketsummaries( function( data, err ) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				console.log('getTicker');
				callback(self.pipes.makeCurrencies(data));
			});
		},
		getBalance : function (data, callback) {
			bittrexAPI.getbalances(function (data, err) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				console.log('getBalance');
				callback(self.pipes.makeBalances(data));
			});
		},
		getOrders : function (data, callback) {
			bittrexAPI.getopenorders({}, function (data, err) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				var open_orders = data.result.map(function (el) {
					el.orderStatus = 'OPEN';
					return el;
				});

				bittrexAPI.getorderhistory({}, function (data, err) {
					if (err) {
						console.log(err);
						return callback(err);
					}

					var closed_orders = data.result.map(function (el) {
						el.orderStatus = 'EXECUTED';
						return el;
					});

					var orders = open_orders.concat(closed_orders);
					callback(self.pipes.makeOrders(orders));
				});
			});
		},
		buyLimit : function (currencyPair, price, quantity, callback) {
			var data = {
				market : self.formatter.makeCurrencyName(currencyPair),
				quantity : quantity,
				rate : price
			};
			console.log(data, quantity * price);
			bittrexAPI.buylimit(data, function (data, err) {
				if (err) {
					// console.log(err);
					return callback(err);
				}
				callback(null, {
					success : data.success,
					exchangeId : data.result.uuid
				});
			});
		},
		sellLimit : function (currencyPair, price, quantity, callback) {
			var data = {
				market : self.formatter.makeCurrencyName(currencyPair),
				quantity : quantity,
				rate : price
			};
			bittrexAPI.selllimit(data, function (data, err) {
				if (err) {
					// console.log(err);
					return callback(err);
				}
				callback(null, {
					success : data.success,
					exchangeId : data.result.uuid
				});
			});
		},
		cancelLimit : function (currencyPair, orderId, callback) {
			var data = {
				uuid : orderId
			}
			bittrexAPI.cancel(data, function (data, err) {
				if (err) {
					return callback(err);
				}
				callback(null);
			});
		},
		getChartData : function (period, currencyPair, callback) {
			var url = 'https://bittrex.com/Api/v2.0/pub/market/GetTicks?tickInterval=fiveMin&marketName=' + encodeURIComponent(self.formatter.makeCurrencyName(currencyPair));
			// console.log(url);
			unirest.get(url).end(function (response) {
				callback(null, self.pipes.makeChartData(response.body));
			}, function (error) {
				console.log(error);
			});
		}
	}

	this.pipes = {
		makeBalances : function (data) {

			data = data.result.map(function (el) {
				return {
					currency : el.Currency,
					total : el.Balance,
					available : el.Available,
				}
			});

			return {
				total : data.filter(function (el) {
					return el.total != 0;
				}).map(function (el) {
					el.type = 'total';
					el.value = el.total;
					return el;
				}),
				available : data.filter(function (el) {
					return el.available != 0;
				}).map(function (el) {
					el.type = 'available';
					el.value = el.available;
					return el;
				})
			}

			// return data;

		},
		makeCurrencies : function (data) {
			data = data.result;
			// .filter(function (el) {
			// 	return el.MarketName.startsWith('BTC-');
			// });
	
			return data.map(function (el) {
				var currencyName = el.MarketName.split('-');
				return {
					symbol : currencyName[1] + '/' + currencyName[0],
					best_ask : el.Ask,
					best_bid : el.Bid,
					currency : currencyName[1],
					volume : el.Volume
				}
			});
		},
		makeOrders : function (data) {

			data = data.map(function (el) {
				var currencyName = el.Exchange.split('-');
				return {
					exchangeId : el.OrderUuid,
					exchangeName : self.name,
					currencyPair : currencyName[1] + '/' + currencyName[0],
					quantity : el.Quantity,
					price : el.Limit,
					type : el.OrderType,
					inBTC : el.Quantity * el.Limit,
					orderStatus : el.orderStatus,
					lastModificationTime : +new Date(el.Closed || el.Opened)
				}
			});

			return data;
		},
		makeChartData : function (data) {

			return data.result.map(function (el) {
				return {
				    open : el['O'],
				    low : el['L'],
				    high : el['H'],
				    close : el['C'],
				    volume : el['V'],
				    timestamp : +new Date(el['T'])
				}
			})


		}
	}
}
	
module.exports = Bittrex;