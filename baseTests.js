var mongoose = require('./configs/mongoose');
var log = require('./configs/logger')(module);
var BaseConnector = require('./baseConnector');
var config = require('./configs/config_file');
var async = require('async');
var _ = require('lodash');

var baseConnector = new BaseConnector('Bittrex');


// var Rollbar = require("rollbar");
// var rollbar = new Rollbar("d1f871271f6840859895328aa1b65114");


// var a = function (value, next) {
// 	setTimeout(function () {
// 		console.log('value is', value);
// 		rr = z.t;
// 		next();
		
// 	}, 100);
// }

// var b = function (next) {
// 	setTimeout(function () {
// 		var x = getY();
// 	}, 100);
// }

// function getY(y) {
// 	var a = z.x;
// 	return a;
// }

// function run() {
// 	async.series([
// 		a.bind(null, 1),
// 		a.bind(null, 2),
// 		a.bind(null, 3),
// 		b.bind(null),
// 	], function (err, data) {
// 		console.log(data, err);
// 	})
// }

// var start = function () {
// 	console.log('start');
// 	try {
// 		run();

// 		setTimeout(run, 1000);
// 	} catch (err) {
// 		rollbar.error(e);
// 		callback({
// 			success : false, 
// 			error : e
// 		});
// 	}
// }

// process.on('uncaughtException', function (err) {
// 	rollbar.error(err);
// });

// start();



mongoose.connection.on('open', function () {
    log.info('connected to database ' + config.get('db:name'));
});

console.log('baseConnector', baseConnector);

// remoteClosedOrders = [
// 	{exchangeId : '4', exchangeName : "Bittrex", orderStatus : 'EXECUTED', quantity : 444},
// 	{exchangeId : '3', exchangeName : "Bittrex", orderStatus : 'EXECUTED', quantity : 333},
// ]
// baseConnector.saveOrder({exchangeId : '1', exchangeName : "Bittrex", orderStatus : 'EXECUTED'}, function (err, res) { 
// 	console.log(err, res);
// });
baseConnector.updateOrder("1", { lastBestAsk : 0.000111 }, function (err, res) {	
	console.log(err, res);
})

// async.waterfall([
	// baseConnector.saveOrder.bind(baseConnector, {exchangeId : '1', exchangeName : "Bittrex", orderStatus : 'EXECUTED'}),
// 	baseConnector.saveOrder.bind(baseConnector, {exchangeId : '2', exchangeName : "Bittrex", orderStatus : 'OPEN'}),
// 	baseConnector.saveOrder.bind(baseConnector, {exchangeId : '3', exchangeName : "Bittrex", orderStatus : 'OPEN'}),
// 	baseConnector.saveOrder.bind(baseConnector, {exchangeId : '4', exchangeName : "Bittrex", orderStatus : 'OPEN'}),
// 	baseConnector.updateOpenOrders.bind(baseConnector, remoteClosedOrders),
// 	baseConnector.updateOrder.bind(baseConnector, 1, { orderStatus : 'HIHI=)' }),
// 	// baseConnector.updateOrder.bind(baseConnector, 2, { orderStatus : 'HIHI=)' }),

// 	baseConnector.removeOrder.bind(baseConnector, 1),
// 	// baseConnector.removeOrder.bind(baseConnector, 2),
// 	// baseConnector.removeOrder.bind(baseConnector, 3),
// 	// baseConnector.removeOrder.bind(baseConnector, 4),

// 	baseConnector.saveOrder.bind(baseConnector, {exchangeId : '5', exchangeName : "Bittrex", orderStatus : 'OPEN'}),
// 	baseConnector.saveOrder.bind(baseConnector, {exchangeId : '6', exchangeName : "Bittrex", orderStatus : 'OPEN'}),

// 	findOrders
// ], function (err, res) {
	// console.log('res ok');
// });

// remoteClosedOrders2 = [
// 	{exchangeId : '4', quantity : 444, price : 222},
// 	{exchangeId : '1', quantity : 111},
// 	{exchangeId : '3', quantity : '333 changed'},
// 	{exchangeId : '2', quantity : 222},
// ]

// var merged = _(remoteClosedOrders)
//   .concat(remoteClosedOrders2)
//   .groupBy("exchangeId")
//   .map(_.spread(_.merge))
//   .value();

// function findOrders (next) {
// 	baseConnector.findOrders({}, function (err, data) {
// 		if (err) return next(err);
// 		next(null);
// 	});
// }