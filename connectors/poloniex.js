var PoloniexAPI = require('../custom_libs/poloniex.js');
var unirest = require('unirest');
var async = require('async');
var moment = require('moment');

function Poloniex() {

	var self = this;

	this.name = 'Poloniex';

	this.key = 'RRHZ462K-8AMMIPKL-UDNEAHM6-0K6K8ZWP'; // Api-key
	this.secretKey = '10a502b157bf5e98f922b29f9a7653548061f43fb512efd1d32ced212b8cc56ae875ef98b0d864206106eb9e87b19cfd3de2bac580d2204763c69339f203f72d'; // Sign

	this.poloniex = new PoloniexAPI(this.key, this.secretKey);

	this.usdName = 'USDT';
	this.min_buy_order_price = 0.00015;
	this.max_buy_order_price = 0.00025;
	this.stop_loss_koef = 5;
	this.profit_koef = 3;
	this.ok_rank_value = 0.6;
	this.min_req_interval = 300;
	this.max_req_interval = 500;
	this.ok_spread_value = 0.2;
	this.exchange_fee = 0.0025;
	this.base_currency_diff_value = 0.005;

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
				console.log('Получение рынка');
				callback(self.pipes.makeCurrencies(data));
			});
		},
		getBalance : function (data, callback) {
			self.poloniex.returnCompleteBalances(function (err, data) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				console.log('Получение баланса');
				callback(self.pipes.makeBalances(data));
			});
		},
		getOrders : function (data, callback) {
			self.poloniex.returnOpenOrders(function (err, data) {
				if (err) {
					console.log(err);
					return callback(err);
				}
				open_orders = [];
				for (var i in data) {
					open_orders = open_orders.concat(data[i].map(function (el) {
						el.orderStatus = 'OPEN';
						el.currencyPair = i;	
						return el;
					}));
				}
				// 3, 4 параметры start end в longdate
				self.poloniex.returnTradeHistory(function (err, data) {
					if (err) {
						console.log(err);
						return callback(err);
					}

					closed_orders = [];
					for (var i in data) {
						if (data[i].map) {
							closed_orders = closed_orders.concat(data[i].map(function (el) {
								el.orderStatus = 'EXECUTED';
								el.currencyPair = i;
								return el;
							}));
						}
					}

					all_orders = open_orders.concat(closed_orders);
					callback(self.pipes.makeOrders(all_orders));
				});
			});
		},
		buyLimit : function (currencyPair, price, quantity, callback) {
			var data = {
				currencyPair : self.formatter.makeCurrencyName(currencyPair),
				amount : quantity,
				rate : price
			};
			self.poloniex.buy(data, function (err, data) {
				if (err) {
					// console.log(err);
					return callback(err);
				}
				callback(null, {
					success : data.success,
					exchangeId : data.orderNumber
				});
			});
		},
		sellLimit : function (currencyPair, price, quantity, callback) {
			var data = {
				currencyPair : self.formatter.makeCurrencyName(currencyPair),
				amount : quantity,
				rate : price
			};
			self.poloniex.sell(data, function (err, data) {

				console.log('poloniex sell limit', err, data);
				if (data.error) {
					// console.log(err);
					return callback(data.error);
				}
				callback(null, {
					success : data.success,
					exchangeId : data.orderNumber
				});
			});
		},
		cancelLimit : function (currencyPair, orderId, callback) {
			var data = {
				orderNumber : orderId,
				currencyPair : self.formatter.makeCurrencyName(currencyPair)
			}
			self.poloniex.cancel(data, function (err, data) {
				if (err) {
					return callback(err);
				}
				callback(null, data);
			});
		},
		getChartData : function (period, currencyPair, callback) {
			var url = 'https://poloniex.com/public?command=returnChartData&start=' + moment().subtract(2,'d').format('X') + '&end=9999999999' +  
				'&period=300&currencyPair=' + encodeURIComponent(self.formatter.makeCurrencyName(currencyPair));
			unirest.get(url).end(function (response) {
				callback(null, self.pipes.makeChartData(response.body));
			}, function (error) {
				console.log(error);
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

			// { orderNumber: '26043399684',
			 //       type: 'buy',
			 //       rate: '0.00033222',
			 //       startingAmount: '0.33110589',
			 //       amount: '0.33110589',
			 //       total: '0.00010999',
			 //       date: '2017-10-31 03:11:03',
			 //       margin: 0 }

			 // { globalTradeID: 249295992,
				 //       tradeID: '1779693',
				 //       date: '2017-10-31 03:16:34',
				 //       rate: '0.00035288',
				 //       amount: '0.31172069',
				 //       total: '0.00010999',
				 //       fee: '0.00250000',
				 //       orderNumber: '26044246836',
				 //       type: 'buy',
				 //       category: 'exchange' }

			data = data.map(function (el) {
				var currencyName = el.currencyPair.split('_');
				return {
					exchangeId : el.orderNumber,
					exchangeName : self.name,
					currencyPair : currencyName[1] + '/' + currencyName[0],
					quantity : el.amount,
					price : el.rate,
					type : el.type == 'buy' ? 'LIMIT_BUY' : 'LIMIT_SELL',
					inBTC : el.total,
					orderStatus : el.orderStatus,
					lastModificationTime : +new Date(el.date)
				}
			});

			return data;
		},
		makeChartData : function (data) {
			return data.map(function (el) {
				return {
					open : el["open"],
				    low : el["low"],
				    high : el["high"],
				    close : el["close"],
				    volume : el["volume"],
				    timestamp : el["date"]
				}
			})
		}
	}
}
	
module.exports = Poloniex;