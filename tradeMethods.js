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
	return setTimeout.bind(null, fn, time);
}

TradeMethods.prototype.randomTime = function (min, max) {
	min = min || this.timeoutTime.min;
	max = max || this.timeoutTime.max;
    return Math.random() * (max - min) + min;
}

TradeMethods.prototype.buyLimit = function (currencyPair, price, quantity, callback) {
	this.exchange.methods.buyLimit(currencyPair, price, quantity, callback);
}
TradeMethods.prototype.sellLimit = function (currencyPair, price, quantity, callback) {
	this.exchange.methods.sellLimit(currencyPair, price, quantity, callback);
}
TradeMethods.prototype.cancelLimit = function (currencyPair, orderId, callback) {
	this.exchange.methods.cancelLimit(currencyPair, price, quantity, callback);
}
TradeMethods.prototype.getTicker = function(callback) {
	this.exchange.methods.getTicker(callback);
}
TradeMethods.prototype.getBalance = function(data, callback) {
	this.exchange.methods.getBalance(data, callback);
}
TradeMethods.prototype.getClientOrders = function (data, callback) {
	this.exchange.methods.getClientOrders(data, callback);
}
TradeMethods.prototype.getChartData = function (period, currencyPair, callback) {
	this.exchange.methods.getBalance(period, currencyPair, callback);
}

module.exports = TradeMethods;