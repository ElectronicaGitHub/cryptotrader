var crypto = require("crypto-js");
var hmac256 = require("crypto-js/hmac-sha256");
var unirest = require('unirest');

function LiveCoin() {

	var self = this;

	this.name = 'LiveCoin';

	this.baseUrl = 'https://api.livecoin.net';

	this.key = 'PhEaHEtMkgc2JEPua8rAnmktSpk8Xxy8'; // Api-key
	this.secretKey = 'nkq7D46GjFe4e4mrnxvTRVHhxge17B6J'; // Sign

	this.usdName = 'USD';
	this.min_buy_order_price = 0.00015;
	this.max_buy_order_price = 0.00025;
	this.stop_loss_koef = 3;

	this.urls = {
		ticker : '/exchange/ticker',
		orders : '/exchange/client_orders',
		getBalance : '/payment/balances',
		getChartData : 'https://www.livecoin.net/tradeapi/mainGraphData', // period=m15&currencyPair=BTC%2FUSD
		buyLimit : '/exchange/buylimit',
		sellLimit : '/exchange/selllimit',
		cancelLimit : '/exchange/cancellimit'
	}

	this.formatter = {
		makeCurrencyName : function (currencyName) {
			return currencyName;
		}
	}

	this.methods = {
		getTicker : function (callback) {
			unirest.get(self.baseUrl + self.urls.ticker).end(function(response) {
				callback(self.pipes.makeCurrencies(response.body));
				console.log('getTicker ok');
			}, function(error) {
				console.log(error);
			});
		},
		getBalance : function (data, callback) {
			var req_data = self.misc.prepareRequestData(data);
			var url = self.baseUrl + self.urls.getBalance + '?' + req_data.url_data;
			unirest.get(url, req_data.headers).end(function(response) {
				callback(self.pipes.makeBalances(response.body));
				console.log('getBalance ok');
			}, function(error) {
				console.log(error);
			});
		},
		getOrders : function (data, callback) {
			var req_data = self.misc.prepareRequestData(data);
			var url = self.baseUrl + self.urls.orders + '?' + req_data.url_data;

			unirest.get(url, req_data.headers).end(function (response) {
				console.log('getClientOrders ok');
				callback(self.pipes.makeOrders(response.body));
			}, function (error) {
				console.log(error);
			});
		},
		buyLimit : function (currencyPair, price, quantity, callback) {
			var url = self.baseUrl + self.urls.buyLimit;
			var data = { currencyPair : currencyPair, price : price, quantity : quantity };
			var req_data = self.misc.prepareRequestData(data);

			unirest.post(url, req_data.headers, data).end(function (response) {
				callback(response.body);
			}, function (error) {
				console.log(error);
				callback(null, error);
			});
		},
		sellLimit : function (currencyPair, price, quantity, callback) {
			var url = self.baseUrl + self.urls.sellLimit;
			var data = { currencyPair : currencyPair, price : price, quantity : quantity };
			var req_data = self.misc.prepareRequestData(data);
			unirest.post(url, req_data.headers, data).end(function (response) {
				callback(response.body);
			}, function (error) {
				console.log('sellLimit error', error);
				callback(null, error);
			});
		},
		cancelLimit : function (currencyPair, orderId, callback) {
			var url = self.baseUrl + self.urls.cancelLimit;
			var data = { currencyPair : currencyPair, orderId : orderId };
			var req_data = self.misc.prepareRequestData(data);

			unirest.post(url, req_data.headers, data).end(function (response) {
				callback(response.body);
			}, function (error) {
				console.log('sellLimit error', error);
				callback(null, error);
			});
		},
		getChartData : function (period, currencyPair, callback) {
			var url = self.urls.getChartData + '?' + 'period=' + period + '&currencyPair=' + encodeURIComponent(currencyPair);
			// console.log(url);
			unirest.get(url).end(function (response) {
				callback(response.body);
			}, function (error) {
				console.log(error);
			});
		}
	}

	this.misc = {
		prepareRequestData : function (data) {
			str = [];
			for (var i in data) {
				str.push(i + '=' + encodeURIComponent(data[i]));
			};
			uri_str = str.join('&');
			headers = {
				'Api-Key' : self.key,
				'Sign' : hmac256(uri_str, self.secretKey).toString(crypto.enc.hex).toUpperCase()
			}
			return { headers : headers, url_data : uri_str };
		}
	}

	this.pipes = {
		makeBalances : function (data) {
			data = data.map(function (el) {
				return {
					type : el.type,
					value : el.value,
					currency : el.currency
				}
			});

			available = data.filter(function (el) {
				return el.value != 0 && (el.type == 'available');
			});
			total = data.filter(function (el) {
				return el.value != 0 && (el.type == 'total');
			});

			return {
				total : total,
				available : available
			}

			// return data;

		},
		makeCurrencies : function (data) {
			return data.map(function (el) {
				return {
					symbol : el.symbol,
					best_ask : el.best_ask,
					best_bid : el.best_bid,
					currency : el.cur,
					volume : el.volume
				}
			});
		},
		makeOrders : function (data) {

			data = data.data.map(function (el) {
				return {
					id : el.id,
					currencyPair : el.currencyPair,
					quantity : el.quantity,
					price : el.price,
					type : el.type,
					inBTC : el.quantity * el.price,
					orderStatus : el.orderStatus,
					lastModificationTime : el.lastModificationTime
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
					return el.type == 'LIMIT_BUY' && (el.orderStatus == 'EXECUTED' || el.orderStatus == 'PARTIALLY_FILLED_AND_CANCELLED');
				}),
				closed_orders : data.filter(function (el) {
					return el.orderStatus == 'EXECUTED' || el.orderStatus == 'PARTIALLY_FILLED_AND_CANCELLED';
				})
			}
		}
	}
}
	
module.exports = LiveCoin;