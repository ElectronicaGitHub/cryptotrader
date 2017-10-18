var crypto = require("crypto-js");
var hmac256 = require("crypto-js/hmac-sha256");
var unirest = require('unirest');

function TradeMethods() {
	this.timeoutTime = {
		min : 500,
		max : 1000
	}
}

TradeMethods.prototype.useExchange = function(exchange) {	
	this.exchange = exchange;
};

TradeMethods.prototype.wrapWait = function(fn, min, max) {
	var time = this.randomTime(min, max);
	console.log('await time', time);
	return setTimeout.bind(null, fn, time);
}

TradeMethods.prototype.randomTime = function (min, max) {
	min = min || this.timeoutTime.min;
	max = max || this.timeoutTime.max;
    return Math.random() * (max - min) + min;
}

TradeMethods.prototype.getTicker = function(callback) {
	console.log('getTicker');
	unirest.get(this.exchange.baseUrl + this.exchange.urls.ticker).end(function(response) {
		// console.log('response', response.body);
		callback(response.body);
		console.log('getTicker ok');
	}, function(error) {
		console.log(error);
	});
};

TradeMethods.prototype.buyLimit = function (currencyPair, price, quantity, callback) {
	var url = this.exchange.baseUrl + this.exchange.urls.buyLimit;
	var data = { currencyPair : currencyPair, price : price, quantity : quantity };
	var req_data = this.prepareRequestData(data);

	unirest.post(url, req_data.headers, data).end(function (response) {
		callback(response.body);
	}, function (error) {
		console.log(error);
		callback(null, error);
	});
}

TradeMethods.prototype.sellLimit = function (currencyPair, price, quantity, callback) {
	var url = this.exchange.baseUrl + this.exchange.urls.sellLimit;
	var data = { currencyPair : currencyPair, price : price, quantity : quantity };
	var req_data = this.prepareRequestData(data);
	unirest.post(url, req_data.headers, data).end(function (response) {
		callback(response.body);
	}, function (error) {
		console.log('sellLimit error', error);
		callback(null, error);
	});
}

TradeMethods.prototype.getBalance = function(data, callback) {
	console.log('getBalance');
	var req_data = this.prepareRequestData(data);
	var url = this.exchange.baseUrl + this.exchange.urls.getBalance + '?' + req_data.url_data;
	unirest.get(url, req_data.headers).end(function(response) {
		console.log('getBalance ok');
		callback(response.body);
	}, function(error) {
		console.log(error);
	});
};

TradeMethods.prototype.getChartData = function (period, currencyPair, callback) {
	var url = this.exchange.urls.getChartData + '?' + 'period=' + period + '&currencyPair=' + encodeURIComponent(currencyPair);
	// console.log(url);
	unirest.get(url).end(function (response) {
		callback(response.body);
	}, function (error) {
		console.log(error);
	})
}

TradeMethods.prototype.getClientOrders = function (data, callback) {
	console.log('getClientOrders');
	var req_data = this.prepareRequestData(data);
	var url = this.exchange.baseUrl + this.exchange.urls.clientOrders + '?' + req_data.url_data;
	// console.log(url);
	unirest.get(url, req_data.headers).end(function (response) {
		console.log('getClientOrders ok');
		callback(response.body);
	}, function (error) {
		console.log(error);
	});
}

TradeMethods.prototype.prepareRequestData = function (data) {

	str = [];
	
	for (var i in data) {
		str.push(i + '=' + encodeURIComponent(data[i]));
	};
	
	// uri_str = str.join('&');
	uri_str = str.join('&');

	// console.log('str', str);
	// console.log('uri_str', uri_str);

	headers = {
		'Api-Key' : this.exchange.key,
		'Sign' : hmac256(uri_str, this.exchange.secretKey).toString(crypto.enc.hex).toUpperCase()
	}

	// console.log(headers);

	return {headers : headers, url_data : uri_str}
}

module.exports = TradeMethods;