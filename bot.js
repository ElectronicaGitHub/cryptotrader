var async = require('async');
var TRADER = require('./tradeMethods');
var connectors = {
	LiveCoin : require('./connectors/livecoin'),
	Bittrex : require('./connectors/bittrex'),
	Poloniex : require('./connectors/poloniex')
}
var BaseConnector = require('./BaseConnector');

var BOT = function() {
	this.TRADERS = [];
	this.trade_cycle_time = 1000 * 60 * 6;
}

BOT.prototype.checkCycle = function (callback) {

	async.eachSeries(this.TRADERS, function (trader, next) {
		trader.checkCycle(next);
		// trader.tradeCycle(next);

	}, function (err, data) {
		callback(null);
	});
}

BOT.prototype.tradeCycle = function (callback) {
	console.log('bot trade cycle');
	async.eachSeries(this.TRADERS, function (trader, next) {
		trader.tradeCycle(next);
		// trader.tradeCycle(next);

	}, function (err, data) {
		callback(null);
	});
}

BOT.prototype.loopTradeCycle = function (callback) {
	console.log('loopTradeCycle STARTED');

	var self = this;

	run();

	interval = setInterval(run, this.trade_cycle_time);

	function run() {
		async.eachSeries(self.TRADERS, function (trader, next) {
			async.waterfall([
				trader.checkCycle.bind(trader),
				trader.tradeCycle.bind(trader)
			], function (error, data) {
				next(null);
			});
		}, function (err, data) {
		});
	}

	callback('ok');
}

BOT.prototype.stopLoopTradeCycle = function (callback) {
	console.log('loopTradeCycle STOPPED');
	clearInterval(interval);
	callback('ok');
}


BOT.prototype.addToTraders = function (exchangeName) {
	var tr = new TRADER();
	tr.useExchange(new connectors[exchangeName]());
	tr.baseConnector = new BaseConnector(exchangeName);
	this.TRADERS.push(tr);
}

BOT.prototype.removeFromTraders = function (elN) {
	this.TRADERS.splice(elN, 1);
}

module.exports = BOT;