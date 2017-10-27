var PoloniexAPI = require('../custom_libs/poloniex.js');

var async = require('async');

function Poloniex() {

	var self = this;

	this.name = 'Poloniex';

	this.key = 'D9YG7RNC-0873L17S-RFDYRPUJ-UVAVIWKM'; // Api-key
	this.secretKey = '16ee5eb11ccf9c6adba472377090404237880090506ba18c4b80721b17feac2075a0e33459e9dbd302585023a0d9a79f337ca143052e32b98930f02df631ff34'; // Sign

	this.poloniex = new PoloniexAPI(this.key, this.secretKey);

	this.usdName = 'USDT';
	this.min_buy_order_price = 0.00015;
	this.max_buy_order_price = 0.00025;
	this.stop_loss_koef = 3;
	this.profit_koef = 5;
	this.ok_rank_value = 0.6;

	this.formatter = {
		makeCurrencyName : function (currencyName) {
			currencyName = currencyName.split('/')
			return currencyName[1] + '_' + currencyName[0];
		}
	}

	this.methods = {
		getTicker : function (callback) {
			self.poloniex.returnTicker( function(err, data) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				console.log('getTicker');
				callback(self.pipes.makeCurrencies(data));
			});
		},
		getBalance : function (data, callback) {
			self.poloniex.returnCompleteBalances(function (err, data) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				console.log('getBalance');
				callback(self.pipes.makeBalances(data));
			});
		},
		getOrders : function (data, callback) {
			self.poloniex.returnOpenOrders(function (err, data) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				// var open_orders = data.result.map(function (el) {
				// 	el.orderStatus = 'OPEN';
				// 	return el;
				// });
				console.log('openOrders', data);
				// 3, 4 параметры start end в longdate
				self.poloniex.returnTradeHistory(function (err, data) {
					if (err) {
						console.log(err);
						return callback(err);
					}
					console.log('tradeHistoryOrders', data);
					// var closed_orders = data.result.map(function (el) {
					// 	el.orderStatus = 'EXECUTED';
					// 	return el;
					// });
					// var orders = open_orders.concat(closed_orders);
					var orders = [];
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
			poloniexAPI.buylimit(data, function (data, err) {
				if (err) {
					// console.log(err);
					return callback(err);
				}
				callback(data);
			});
		},
		sellLimit : function (currencyPair, price, quantity, callback) {
			var data = {
				market : self.formatter.makeCurrencyName(currencyPair),
				quantity : quantity,
				rate : price
			};
			console.log(data, quantity * price);
			poloniexAPI.selllimit(data, function (data, err) {
				if (err) {
					// console.log(err);
					return callback(err);
				}
				callback(data);
			});
		},
		cancelLimit : function (currencyPair, orderId, callback) {
			var data = {
				uuid : orderId
			}
			poloniexAPI.cancel(data, function (data, err) {
				if (err) {
					return callback(err);
				}
				callback(data);
			});
		}
	}

	this.pipes = {
		makeBalances : function (data) {

			dataArr = [];
			
			for (var i in data) {
				data[i].currency = i;
				dataArr.push(data[i]);
			}

			data = dataArr.map(function (el) {
				return {
					currency : el.currency,
					total : +el.available + +el.onOrders,
					available : +el.available,
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
			
			dataArr = [];
			
			for (var i in data) {
				data[i].marketName = i;
				dataArr.push(data[i]);
			}

			// console.log(dataArr);
	
			return dataArr.map(function (el) {
				var currencyName = el.marketName.split('_');
				return {
					symbol : currencyName[1] + '/' + currencyName[0],
					best_ask : el.lowestAsk,
					best_bid : el.highestBid,
					currency : currencyName[1],
					volume : el.quoteVolume
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
	
module.exports = Poloniex;