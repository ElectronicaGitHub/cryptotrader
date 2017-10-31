var Order = require('./models/Order.js');
var _ = require('lodash');
var async = require('async');

// выставили ордер на покупку
// сохранили orderStatus = OPEN

// бежим по всем покупкам что сохранены опен
// бежим по всем открытым селл ордерам и смотрим закрылись ли они
// если статус поменян то ставим orderStatus = EXECUTED

// отменяем все выставленные на продажу, удаляем их из базы по ид
// покупаем новые сохраняем в базу с orderStatus = OPEN

// выставляем ордер на продажу сохраняем его в нем ид покупочного buyOrderId
// если квикселим то заменяем тот ордер новым оставляя buyOrderId



var BaseConnector = function (exchangeName) {
	this.exchangeName = exchangeName;
}

BaseConnector.prototype.findOrder = function (request, next) {
	request.exchangeName = this.exchangeName;
	Order.findOne(request, function (err, data) {
		if (err) return next(err);
		next(null, data);
	});
}

BaseConnector.prototype.findOrders = function (request, next) {
	request.exchangeName = this.exchangeName;
	Order.find(request, function (err, data) {
		if (err) return next(err);
		next(null, data);
	});
}

BaseConnector.prototype.saveOrder = function (order, next) {
	order.exchangeName = this.exchangeName;
	var order = new Order(order);

	order.save(function (err, result) {
		if (err) return next(err);
		next(null);
	});
}

BaseConnector.prototype.updateOpenOrders = function (remote_closed_orders, next) {
	var self = this;
	var obj = { orderStatus : 'OPEN', exchangeName : self.exchangeName};
	Order.find(obj, function (err, open_orders) {

		if (err) return next(err);

		async.each(open_orders, function (order, each_next) {
			var our_order = remote_closed_orders.filter(function (el) {
				return order.exchangeId == el.exchangeId;
			})[0];
			if (our_order) {
				order = _.extend(order, our_order);
			}
			order.save(each_next);
		}, function (err, data) {
			next(null);
		})

		// var remote_open_orders_ids = remote_closed_orders.map(function (el) { return el.exchangeId; });
		// var open_orders_ids = open_orders.map(function (el) { return el.exchangeId; });

		// var ids = _.difference(open_orders_ids, remote_open_orders_ids)
		// // [1,2,3,4] [1,2] => [3,4]
		// // console.log('remote_open_orders_ids', remote_open_orders_ids);
		// // console.log('open_orders_ids', open_orders_ids);
		// // console.log('difference ids', ids);

		// Order.update({exchangeId : { $in : ids }}, { orderStatus : 'EXECUTED'}, { multi : true }, function (err, result) {
		// 	if (err) return next(err);
		// 	next(null);
		// });

	});
}

BaseConnector.prototype.removeOrder = function (exchangeId, next) {
	var self = this;
	Order.findOneAndRemove({ exchangeId : exchangeId, exchangeName : self.exchangeName}, function (err, result) {
		if (err) return next(err);
		next(null);
	});
}

BaseConnector.prototype.updateOrder = function (exchangeId, order, next) {
	var self = this;
	Order.findOneAndUpdate({ exchangeId : exchangeId, exchangeName : self.exchangeName}, order, function (err, result) {
		if (err) return next(err);
		next(null);
	});
}

module.exports = BaseConnector;