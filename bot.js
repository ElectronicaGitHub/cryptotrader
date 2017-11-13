var mongoose = require('./configs/mongoose');
var async = require('async');
var TRADER = require('./tradeMethods');

var AnalyticsModule = require('./analyticsModule');

var Rollbar = require("rollbar");
var rollbar = new Rollbar({
	accessToken: "d1f871271f6840859895328aa1b65114",
	captureUncaught: true,
	captureUnhandledRejections: true
});

var connectors = {
	LiveCoin : require('./connectors/livecoin'),
	Bittrex : require('./connectors/bittrex'),
	Poloniex : require('./connectors/poloniex')
}
var BaseConnector = require('./baseConnector');

var BOT = function() {
	this.TRADERS = [];
	this.trade_cycle_time = 1000 * 60 * 6;
	this.collect_cycle_time = 1000 * 60 * 1;
}

BOT.prototype.loopCollectChartData = function (callback) {

	console.log('mongoose.connection.readyState', mongoose.connection.readyState);

	var self = this;

	run();

	interval = setInterval(run, this.collect_cycle_time);


	function run() {
		async.eachSeries(self.TRADERS, function (trader, next) {
			trader.collectChartData(next);
		}, function (err, data) {
			// console.log('Сбор успешно завершен');
			callback(null);
		});
	}
}

BOT.prototype.checkCycle = function (callback) {

	async.eachSeries(this.TRADERS, function (trader, next) {
		trader.checkCycle(true, next);
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
			try {
				async.eachSeries(self.TRADERS, function (trader, next) {
					async.waterfall([
						trader.checkCycle.bind(trader, true),
						trader.tradeCycle.bind(trader)
					], function (error, data) {
						next(null);
					});
				}, function (err, data) {});
			} catch (e) {

				rollbar.error(e);
				callback({
					success : false, 
					error : e
				});

			}
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
	tr.analyticsModule = new AnalyticsModule();
	this.TRADERS.push(tr);
}

BOT.prototype.removeFromTraders = function (elN) {
	this.TRADERS.splice(elN, 1);
}

module.exports = BOT;