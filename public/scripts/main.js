angular.module('crypto', []).controller('main', ['$scope', '$http', '$timeout', function($scope, $http, $timeout) {
	console.log('hello');

	let params = {
		// насколько от нижней границы в процентах заходить на покупку
		percent_from_min_to_base : 60,
		// процент разницы в значениях в начале и в конце графа
		percent_graph_raise_value : 1,
		// куда стараемся переставить переставить
		// от одной границы до другой, неподошло в одну смотрим другую и тд
		percent_from_base_to_max_to_buy_min : 40,
		percent_from_base_to_max_to_buy_max : 70,
		percent_from_base_to_max_step : 10,
		min_profit_percent : 0.8
	}
	// let analyticsModule = new AnalyticsModule();

	// $scope.makeGraphsForClosedOrders = function (trader) {
		// $timeout(function () {
		// 	for (let pair of trader.closed_orders) {
		// 		$scope.makeGraphForClosedOrder(trader, pair);
		// 	}
		// });
	// }

	$scope.setTraderSelected = function(trader) {
		$scope.selectedTrader = trader;
	}

	$scope.init = function (trader) {
		$scope.getBTCBalances(trader);
		$scope.getClosedOrders(trader);
		$scope.getAbleToBuyPairs(trader);
		$scope.getPairsGraphData(trader);
		$scope.getLastBaseToFiatChart(trader);
	}

	$scope.bot = window.bot;
	// $scope.bot = {};
	$scope.date_long = +new Date();
	$scope.firstTime = true;
	$scope.show_info = false;
	$scope.show_balance = true;

	console.log($scope.bot);

	if ($scope.bot) {
		$scope.setTraderSelected($scope.bot.TRADERS[0]);

	// 	for (let trader of $scope.bot.TRADERS) {
	// 		trader.closed_orders = makeClosedPairs(trader.closed_orders_by_curr);
	// 		trader.closed_orders.map(pair => {
	// 			b_order = pair.buy_order;
	// 			if (b_order) {
	// 				pair.pairProfit = b_order.quantity * pair.price - b_order.quantity * b_order.price;
	// 				pair.std = calcStandartDeviation(pair);
	// 			}
	// 			return pair;
	// 		})
	// 		calcSummaries(trader);
	// 		// $scope.makeGraphsForClosedOrders(trader);
	// 	}

	}

	$scope.moment = moment;

	$scope.view = null; // buy_and_sell

	$scope.checkCycle = function () {
		$http.post('/checkCycle').then(function (data) {
			console.log('success', data.data);

			$scope.bot = data.data.bot;

			if ($scope.firstTime) {
				$scope.setTraderSelected($scope.bot.TRADERS[0]);
				$scope.firstTime = false;
			}

			console.log($scope.bot);

			for (let trader of $scope.bot.TRADERS) {
				makeOrders(trader);
				// $scope.makeGraphsForClosedOrders(trader);
			}

		}, function (error) {
			console.log(error);
		});
	}

	function makeOrders (trader) {
		trader.closed_orders = makeClosedPairs(trader.closed_orders_by_curr);
		trader.closed_orders.map(pair => {
			b_order = pair.buy_order;
			if (b_order) {
				pair.pairProfit = b_order.quantity * pair.price - b_order.quantity * b_order.price;
				pair.std = calcStandartDeviation(pair);
			}
			return pair;
		})
		calcSummaries(trader);
	}

	function calcStandartDeviation(pair) {

		if (!pair.buy_order || !pair.buy_order.analyticsResult) return;

		let data = pair.buy_order.buyMomentChartData.map((el, n) => {
			return [pair.buy_order.analyticsResult.values.first_value_x + (n * 1000 * 60), el, 1];
		});

		// let mat_ojidanie = pair.buy_order.buyMomentChartData.data.map(el => el[1]).reduce((a,b) => a+b) / data.length;
		let sum = data.map(el => { 

		let avg_current_val = (pair.buy_order.analyticsResult.lines.baseLine.m * el[0] ) + pair.buy_order.analyticsResult.lines.baseLine.b;
		let diff = avg_current_val - el[1];
		return Math.pow(diff, 2); }).reduce((a, b) => a+b);
	
		let srevdekvad_otkl = Math.sqrt(sum) / data.length;

			// console.log('srevdekvad_otkl', srevdekvad_otkl);
			// console.log('mat_ojidanie', mat_ojidanie);

		return srevdekvad_otkl;

	}

	function calcSummaries(trader) {
		trader.summary = {};
		if (trader.total_balances) {
			trader.summary.inBTC = trader.total_balances.map(function (el) {
				return el.inBTC;
			}).reduce(function (a,b) {
				return a + b;
			});
		}
		
		if (trader.closed_orders.length) {
			trader.summary.closed_ordersInBTC = trader.closed_orders.map(function (el) {
				var b_order = el.buy_order;
				if (b_order) {
					return el.price * b_order.quantity - b_order.price * b_order.quantity;
				} else {
					return 0;
				}
			}).reduce(function (a,b) {
				return a + b;
			});

			var today_closed_orders = trader.closed_orders.filter(function (el) {
				return moment($scope.date_long).isSame(el.lastModificationTime, 'd');
			});


			if (today_closed_orders.length) {
				trader.summary.pairsCount = today_closed_orders.length;
				var sums = today_closed_orders.map(function (el) {
					var b_order = el.buy_order;
					if (b_order) {
						return el.price * b_order.quantity - b_order.price * b_order.quantity;
					} else {
						return 0;
					};
				});
				trader.summary.today_incomeInBTC = sums.reduce(function (a, b) {
					return a + b;
				});
			} else {
				trader.summary.today_incomeInBTC = 0;
			}

		}
	}

	function makeClosedPairs(orders_currencies) {
		for (let i in orders_currencies) {
			let obj = { sell : [], buy : []};
			for (let k in orders_currencies[i]) {
				if (orders_currencies[i][k]) {
					if (orders_currencies[i][k].type == 'LIMIT_BUY') {
						obj.buy.push(orders_currencies[i][k]);
					} else if (orders_currencies[i][k].type == 'LIMIT_SELL') {
						obj.sell.push(orders_currencies[i][k]);
					}
				}
			}

			for (let j in obj.sell) {
				// закрытые покупки, надо проставить !!!
				var buys = obj.buy;
				buys = buys.filter((el) => el.lastModificationTime < obj.sell[j].lastModificationTime);
				obj.sell[j].buy_order = _.sortBy(buys, 'lastModificationTime')[buys.length - 1];
			}
			// delete obj.buy;

			orders_currencies[i] = obj;
		}

		var orders = [];

		for (let i in orders_currencies) {
			for (let k in orders_currencies[i].sell) {
				orders.push(orders_currencies[i].sell[k]);
			}
		}

		return orders;
	}

	$scope.tradeCycle = function () {
		$http.post('/tradeCycle').then(function(data) {
			console.log('tradeCycle', data);
		}, function (error) {
			console.log(error);
		});
	}

	$scope.getBTCBalances = function (trader) {
		$http.post('/balance', {
			exchangeName : trader.exchange.name
		}).then(function(data) {
			trader.btc_balances = data;
			makeBalanceGraph(trader);
		}, function (error) {
			console.log(error);
		});
	}

	$scope.getAbleToBuyPairs = function (trader) {
		$http.post('/able_to_buy_pairs', {
			exchangeName : trader.exchange.name
		}).then(function(data) {
			trader.able_to_buy_pairs = data.data;
		}, function (error) {
			console.log(error);
		});
	}

	$scope.getPairsGraphData = function (trader) {
		$http.post('/pairs_graph_data', {
			exchangeName : trader.exchange.name
		}).then(function(data) {
			trader.pairs_graph_data = data.data;
		}, function (error) {
			console.log(error);
		});
	}

	$scope.getClosedOrders = function (trader) {
		$http.post('/closed_orders', {
			exchangeName : trader.exchange.name
		}).then(function(data) {
			trader.closed_orders_by_curr = data.data;
			makeOrders(trader);
		}, function (error) {
			console.log(error);
		});
	}

	$scope.getLastBaseToFiatChart = function (trader) {
		$http.post('/lastBaseToFiatChart', {
			exchangeName : trader.exchange.name
		}).then(function(data) {
			trader.lastBaseToFiatChart = data.data;
		}, function (error) {
			console.log(error);
		});
	}
	

	$scope.loopTradeCycle = function () {
		$http.post('/loopTradeCycle').then(function(data) {
			console.log('loopTradeCycle', data);
		}, function (error) {
			console.log(error);
		});
	}

	$scope.saveTraderChanges = function (trader) {
		$http.post('/saveTraderChanges', {
			name : trader.exchange.name,
			stop_loss_koef : trader.exchange.stop_loss_koef,
			profit_koef : trader.exchange.profit_koef,
			ok_rank_value : trader.exchange.ok_rank_value,
			ok_spread_value : trader.exchange.ok_spread_value
		});
	}

	$scope.saveTraderAnalyticsChanges = function (trader) {
		$http.post('/saveTraderAnalyticsChanges', {
			name : trader.exchange.name,
			params : trader.analyticsModule.params
		});
	}

	$scope.stopLoopTradeCycle = function () {
		$http.post('/stopLoopTradeCycle').then(function (data) {
			console.log('stopped');
		}, function (error) {
			console.log('error', error);
		});
	}

	$scope.removeOrder = function (pair, exchangeName) {
		$http.post('/removeOrder', { 
			exchangeName, 
			currencyPair : pair.sell_order.currencyPair, 
			exchangeId : pair.sell_order.exchangeId 
		}).then(function (data) {
			console.log(data);
			pair.removed = true;
		}, function (error) {
			console.log(error);
		});
	}

	$scope.toggleExchange = function (trader) {
		$http.post('/toggleExchange', {
			exchangeName : trader.exchange.name
		}).then(function (res) {

			console.log(res);
			trader.active = !trader.active;

		}, function (err) {
			console.log(err);
		})
	}

	$scope.exchange_pairs_filter = function (el) {
		return el.rank > 0.2;
	}

	$scope.inUSD = function (trader, valueinBTC) {
		return valueinBTC * trader.btc_usd.best_ask;
	}

	$scope.makeGraphForClosedOrder = function (trader, sell_pair) {

		if (!sell_pair.buy_order || !sell_pair.buy_order.analyticsResult) return;
		
		let graph_id = 'graph-' + trader.exchange.name + '-' + sell_pair.currencyPair + '-' + sell_pair.buy_order.exchangeId;
		let lines  = sell_pair.buy_order.analyticsResult.lines;
		let values = sell_pair.buy_order.analyticsResult.values;

		let lastModificationTime = sell_pair.buy_order.lastModificationTime;

		let data = sell_pair.buy_order.buyMomentChartData.map((el, n) => {
			return [values.first_value_x + (n * 1000 * 60), el, 1];
		});

		let data2 = trader.pairs_graph_data[sell_pair.currencyPair];
		data2 = data2.map((el, n) => [el.timestamp, +el.best_ask, 1]);

		let summary_data = data.concat(data2);

		$scope.makeGraph(graph_id, lines, values, summary_data);
	}

	$scope.makeGraphForCurrentMarket = function (trader, pair) {

		let data = trader.pairs_graph_data[pair.symbol];

		if (!data) return;

		let graph_id = 'graph-' + trader.exchange.name + '-' + pair.symbol;
		let lines = pair.analyticsResult.lines;
		let values = pair.analyticsResult.values;

		data = data.map((el, n) => [el.timestamp, +el.best_ask, 1]);

		// data.push([+(moment().add(1,'d')), data[data.length - 1][1], 1]);
		// data.unshift([+(moment().subtract(1,'d')), data[0][1], 1]);

		$scope.makeGraph(graph_id, lines, values, data);
	}

	$scope.makeGraph = function (graph_id, lines, values, data) {
		setTimeout(function () {
			Highcharts.chart(graph_id, {
				chart : {
					height: 200
				},
				xAxis: {
			        type: 'datetime'
				},
				legend : {
					enabled : false
				},
				title : { text : null },
			    series: [
			    {
		            type: 'line',
		            name: 'Regression Line',
		            data: [
		            	[lines.baseLine.data[0].x, lines.baseLine.data[0].y], 
		            	[lines.baseLine.data[1].x, lines.baseLine.data[1].y]
		            ], 
		            marker: { enabled: false },
		            states: { hover: { lineWidth: 0 } },
		            enableMouseTracking: false
		        },
		        {
		            type: 'line',
		            name: 'Regression Line Min',
		            data: [
		            	[lines.minLine.data[0].x, lines.minLine.data[0].y], 
		            	[lines.minLine.data[1].x, lines.minLine.data[1].y]
		            ], 
		            marker: { enabled: false },
		            states: { hover: { lineWidth: 0 } },
		            enableMouseTracking: false,
		            color: Highcharts.getOptions().colors[0],
		            lineWidth : 1
		        },
		        {
		            type: 'line',
		            name: 'Regression Line Max',
		            data: [
		            	[lines.maxLine.data[0].x, lines.maxLine.data[0].y], 
		            	[lines.maxLine.data[1].x, lines.maxLine.data[1].y]
		            ], 
		            marker: { enabled: false },
		            states: { hover: { lineWidth: 0 } },
		            enableMouseTracking: false,
		            color: Highcharts.getOptions().colors[0],
		            lineWidth : 1
		        },
				{
		            type: 'line',
		            name: 'Regression Line Min Percentage',
		            data: [
		            	[lines.minPercentageLine.data[0].x, lines.minPercentageLine.data[0].y], 
		            	[lines.minPercentageLine.data[1].x, lines.minPercentageLine.data[1].y]
		            ], 
		            marker: { enabled: false },
		            states: { hover: { lineWidth: 0 } },
		            enableMouseTracking: false,
		            color: '#66AA22',
		            lineWidth : 2
		        },
		        {
		            type: 'line',
		            name: 'Линия перестановки',
		            data: [
		            	[lines.baseLine.data[0].x, values.sell_price], 
		            	[lines.baseLine.data[1].x, values.sell_price]
		            ], 
		            marker: { enabled: false },
		            states: { hover: { lineWidth: 0 } },
		            enableMouseTracking: false,
		            color : '#00FF00',
		            lineWidth: 4
		        },
		        {
		            type: 'line',
		            name: 'Стоп-лосс линия',
		            data: [
		            	[lines.baseLine.data[0].x, values.stop_loss_price], 
		            	[lines.baseLine.data[1].x, values.stop_loss_price]
		            ], 
		            marker: { enabled: false },
		            states: { hover: { lineWidth: 0 } },
		            enableMouseTracking: false,
		            color : '#FF0000',
		            lineWidth: 4
		        },
		        {
			        name: 'Full Range',
			        data: [
						[ values.first_value_x, values.first_min_y, values.first_max_y],
						[ values.last_value_x, values.last_min_y, values.last_max_y]
			        ],
			        type: 'arearange',
			        lineWidth: 0,
			        linkedTo: ':previous',
			        color: Highcharts.getOptions().colors[0],
			        fillOpacity: 0.3,
			        zIndex: 0,
			        marker: {
			            enabled: false
			        }
		        },
		        { 
			    	type: 'line', 
			    	marker: { enabled: false },
			    	name: 'BTC/USD', 
			    	data 
			    }
			    ]
			});
		});
	}

	function makeBalanceGraph(trader) {

		trader.balances_by_date_obj = {};
		for (let balance of trader.btc_balances.data) {
			let timestamp = balance.timestamp;
			let date = moment(balance.timestamp).format('L');
			if (!trader.balances_by_date_obj[date] || trader.balances_by_date_obj[date].timestamp < balance.timestamp) {
				trader.balances_by_date_obj[date] = {
					total : balance.total,
					timestamp : balance.timestamp
				}
			}
		}
		trader.balances_by_date = [];
		for (let i in trader.balances_by_date_obj) {
			trader.balances_by_date.push({ 
				date : moment(i), 
				value : trader.balances_by_date_obj[i].total
			})
		}
		for (let i in trader.balances_by_date) {
			let current = trader.balances_by_date[i];
			let prev = trader.balances_by_date[+i - 1];
			if (prev) {
				trader.balances_by_date[i].diff = current.value - prev.value;
			}
		}

		console.log(trader.balances_by_date);

		let total_data = trader.btc_balances.data.map(el => {
			return [+new Date(el.timestamp), el.total, 1];
		});

		let available_data = trader.btc_balances.data.map(el => {
			return [+new Date(el.timestamp), el.available, 1];
		});

		avg_total = total_data.map(el => el[1]).reduce((a,b)=> a+b)/total_data.length;
		avg_available = available_data.map(el => el[1]).reduce((a,b)=> a+b)/available_data.length;

		total_data = total_data.filter(el => { return (el[1] / avg_total) < 1.5; });
		available_data = available_data.filter(el => { return (el[1] / avg_available) < 1.5; });

		// console.log(total_data, available_data);

		let graph_id = 'balance-graph-' + trader.exchange.name;

		setTimeout(function () {
			Highcharts.chart(graph_id, {
				chart : {
					height: 200
				},
				xAxis: {
			        type: 'datetime'
				},
				legend : {
					enabled : false
				},
				title : { text : null },
			    series: [{ 
			    	type: 'line', 
			    	marker: { enabled: false },
			    	name: 'total', 
			    	color: 'blue',
			    	data : total_data
			    }, 
			    // { 
			    // 	type: 'line', 
			    // 	marker: { enabled: false },
			    // 	name : 'available',
			    // 	color: 'red',
			    // 	data : available_data
			    // }
			    ]
			});
		});
	}

	// делалось для какого то хуя
	$scope.makeBTCGraph = function(trader) {

		if (!trader.lastBaseToFiatChart) return;

		var _data = trader.lastBaseToFiatChart.map(el => {
			return [el.timestamp, el.close, 1];
			// return [el.close];
		});
		var closeds = trader.closed_orders.filter(el => el.buy_order);

		closeds = _.sortBy(closeds, ['lastModificationTime']);

		var closeds_ok = closeds.filter(el => { return el.pairProfit > 0; })
		.map(el => {
			return [
				el.lastModificationTime, 
				_.sortBy(_data.filter(data_el => data_el[0] <= el.lastModificationTime), ['lastModificationTime']).reverse()[0][1], 
				1
			];
		});

		var closeds_not_ok = closeds.filter(el => { return el.pairProfit < 0; })
		.map(el => {
			return [
				el.lastModificationTime, 
				_.sortBy(_data.filter(data_el => data_el[0] <= el.lastModificationTime), ['lastModificationTime']).reverse()[0][1],
				1
			];
		});
		var data = _data.filter(el => {
			return el[0] > closeds[0].lastModificationTime;
		});

		// data = _data;
		// console.log(data);

		let name = 'btc-graph-' + trader.exchange.name;

		console.log('chart id', name);

		setTimeout(function () {
			Highcharts.chart(name, {
				chart : {
					height: 400
				},
				xAxis: {
			        type: 'datetime',
				},
			    series: [{ 
			    	type: 'line', 
			    	name: 'BTC/USD', 
			    	data 
			    }, 
			    {
			    	name : 'closeds_ok',
					type : 'scatter',
					data : closeds_ok,
					color: "#00FF00"
			    },{
			    	name : 'closeds_not_ok',
					type : 'scatter',
					data : closeds_not_ok,
					color: '#FF0000'
			    }
			    ]
			});
		});
	}
}]);