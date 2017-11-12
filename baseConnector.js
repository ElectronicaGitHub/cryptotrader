var Order = require('./models/Order.js');
var ChartData = require('./models/ChartData.js');
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

BaseConnector.prototype.updateChartData = function (next) {

	let new_values_array = this.exchange_pairs;
	let trader = this;

	ChartData.findOne({ exchangeName : this.exchange.name }, function (err, chart_data_value) {
		
		let ttl = 1000 * 60 * 60 * trader.analyticsModule.params.graph_hours;
		// ttl *= 1.2;

		if (!chart_data_value) {
	
			let json_to_save = {};

			for (currency of new_values_array) {
				json_to_save[currency.symbol] = json_to_save[currency.symbol] || [];
				json_to_save[currency.symbol].push(currency);
				json_to_save[currency.symbol] = json_to_save[currency.symbol]
					.filter(el => el.timestamp >= (+new Date() - ttl));
			}
			
			let n = new ChartData({ 
				exchangeName : trader.exchange.name, 
				json : JSON.stringify(json_to_save) 
			});

			n.save(function (err, res) {
				if (err) return next(err);
				next(null, json_to_save);
			});
		} else {
			let json_to_update = JSON.parse(chart_data_value.json);
			for (currency of new_values_array) {
				json_to_update[currency.symbol] = json_to_update[currency.symbol] || [];
				json_to_update[currency.symbol].push(currency);
				json_to_update[currency.symbol] = json_to_update[currency.symbol]
					.filter(el => el.timestamp >= (+new Date() - ttl));
			}

			chart_data_value.json = JSON.stringify(json_to_update);

			chart_data_value.save(function (err, data) {
				if (err) return next(err);
				next(null, json_to_update);
			});
		}
	})
}

BaseConnector.prototype.getChartData = function (next) {
	let request = {};
	request.exchangeName = this.exchangeName;
	ChartData.findOne(request, function (err, data) {
		next(null, JSON.parse(data.json));
	});
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
				order.orderStatus = 'EXECUTED';
			}
			order.save(function (err, res) {
				if (err) return each_next(err);
				each_next(null);
			});
		}, function (err, data) {
			next(null);
		})
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