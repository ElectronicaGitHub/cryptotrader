var mongoose = require('./configs/mongoose');
var log = require('./configs/logger')(module);
var BaseConnector = require('./baseConnector');
var config = require('./configs/config_file');
var async = require('async');
_ = require('lodash');

var baseConnector = new BaseConnector('Bittrex');

mongoose.connection.on('open', function () {
    log.info('connected to database ' + config.get('db:name'));
});

console.log('baseConnector', baseConnector);

remoteClosedOrders = [
	{exchangeId : '4', exchangeName : "Bittrex", orderStatus : 'EXECUTED', quantity : 444},
	{exchangeId : '3', exchangeName : "Bittrex", orderStatus : 'EXECUTED', quantity : 333},
]
// async.waterfall([
// 	baseConnector.saveOrder.bind(baseConnector, {exchangeId : '1', exchangeName : "Bittrex", orderStatus : 'OPEN'}),
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
// 	console.log('res ok');
// });

remoteClosedOrders2 = [
	{exchangeId : '4', quantity : 444, price : 222},
	{exchangeId : '1', quantity : 111},
	{exchangeId : '3', quantity : '333 changed'},
	{exchangeId : '2', quantity : 222},
]

var merged = _(remoteClosedOrders)
  .concat(remoteClosedOrders2)
  .groupBy("exchangeId")
  .map(_.spread(_.merge))
  .value();

console.log(merged);

function findOrders (next) {
	baseConnector.findOrders({}, function (err, data) {
		if (err) return next(err);
		next(null);
	});
}
