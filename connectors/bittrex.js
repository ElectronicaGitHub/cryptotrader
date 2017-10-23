var bittrexAPI = require('node-bittrex-api');
var async = require('async');

function Bittrex() {

	var self = this;

	this.name = 'LiveCoin';

	this.key = 'f791e840f2474fa9a6c81265f21b9c87'; // Api-key
	this.secretKey = 'cb96f00f09c64f239d9d9d3de2933218'; // Sign

	bittrexAPI.options({
	  'apikey' : this.key,
	  'apisecret' : this.secretKey,
	});

	this.usdName = 'USDT';
	this.max_buy_order_price = 0.0005;

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
		getClientOrders : function (data, callback) {
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
					console.log(err);
					return callback(err);
				}
				callback();
			});
		},
		sellLimit : function (currencyPair, price, quantity, callback) {
			var data = {
				market : self.formatter.makeCurrencyName(currencyPair),
				quantity : quantity,
				rate : price
			};
			console.log(data, quantity * price);
			bittrexAPI.selllimit(data, function (data, err) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				callback();
			});
		},
		cancelLimit : function (currencyPair, orderId, callback) {
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

			available = data.filter(function (el) {
				return el.available != 0;
			}).map(function (el) {
				el.type = 'available';
				el.value = el.available;
				return el;
			});
			total = data.filter(function (el) {
				return el.total != 0;
			}).map(function (el) {
				el.type = 'total';
				el.value = el.total;
				return el;
			});

			return {
				total : total,
				available : available
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
					id : el.OrderUuid,
					currencyPair : currencyName[1] + '/' + currencyName[0],
					quantity : el.Quantity,
					price : el.Limit,
					type : el.OrderType,
					inBTC : el.Quantity * el.Limit,
					orderStatus : el.orderStatus,
					lastModificationTime : +new Date(el.Closed || el.Opened)
				}
			});

			return {
				open_sell_orders : data.filter(function (el) {
					return el.type == 'LIMIT_SELL' && el.orderStatus == 'OPEN';
				}),
				open_buy_orders : data.filter(function (el) {
					return el.type == 'LIMIT_BUY' && el.orderStatus == 'OPEN';
				}),
				closed_buy_orders : data.filter(function (el) {
					return el.type == 'LIMIT_BUY' && el.orderStatus == 'EXECUTED';
				}),
				closed_orders : data.filter(function (el) {
					return el.orderStatus == 'EXECUTED';
				})
			}
		}
	}
}
	
module.exports = Bittrex;