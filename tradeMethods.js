var crypto = require("crypto-js");
var hmac256 = require("crypto-js/hmac-sha256");
var unirest = require('unirest');

function TRADER() {
	this.timeoutTime = {
		min : 500,
		max : 1000
	}
	this.active = true;
}

TRADER.prototype.useExchange = function(exchange) {	
	this.exchange = exchange;
};

TRADER.prototype.wrapWait = function(fn, min, max) {
	min = min || this.exchange.min_req_interval;
	max = max || this.exchange.max_req_interval;
	var time = this.randomTime(min, max);
	return setTimeout.bind(null, fn, time);
}

TRADER.prototype.randomTime = function (min, max) {
	min = min || this.timeoutTime.min;
	max = max || this.timeoutTime.max;
    return Math.random() * (max - min) + min;
}

TRADER.prototype.check = function (callback) {
	this.exchange.methods.check(callback);
}
TRADER.prototype.buyLimit = function (currencyPair, price, quantity, callback) {
	this.exchange.methods.buyLimit(currencyPair, price, quantity, callback);
}
TRADER.prototype.sellLimit = function (currencyPair, price, quantity, callback) {
	this.exchange.methods.sellLimit(currencyPair, price, quantity, callback);
}
TRADER.prototype.cancelLimit = function (currencyPair, orderId, callback) {
	this.exchange.methods.cancelLimit(currencyPair, orderId, callback);
}
TRADER.prototype.getTicker = function(callback) {
	this.exchange.methods.getTicker(callback);
}
TRADER.prototype.getBalance = function(data, callback) {
	this.exchange.methods.getBalance(data, callback);
}
TRADER.prototype.getOrders = function (data, callback) {
	this.exchange.methods.getOrders(data, callback);
}
TRADER.prototype.getChartData = function (period, currencyPair, callback) {
	this.exchange.methods.getChartData(period, currencyPair, callback);
}

module.exports = TRADER;