angular.module('crypto', []).controller('main', ['$scope', '$http', function($scope, $http) {
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

	$scope.setTraderSelected = function(trader) {
		$scope.selectedTrader = trader;
	}

	$scope.bot = window.bot;
	$scope.date_long = +new Date();
	$scope.firstTime = true;
	$scope.showInfo = true;

	console.log($scope.bot);

	if ($scope.bot) {
		$scope.setTraderSelected($scope.bot.TRADERS[0]);

		for (var trader of $scope.bot.TRADERS) {
			trader.closed_orders = makeClosedPairs(trader.closed_orders_by_curr);
			calcSummaries(trader);
		}

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

			for (var trader of $scope.bot.TRADERS) {
				trader.closed_orders = makeClosedPairs(trader.closed_orders_by_curr);
				calcSummaries(trader);
			}

		}, function (error) {
			console.log(error);
		});
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
		            color : '#FF0000',
		            lineWidth: 3
		        },
		        // {
		        //     type: 'line',
		        //     name: 'Линия перестановки макс',
		        //     data: [
		        //     	[lines.baseLine.data[0].x, sell_price_max], 
		        //     	[lines.baseLine.data[1].x, sell_price_max]
		        //     ], 
		        //     marker: { enabled: false },
		        //     states: { hover: { lineWidth: 0 } },
		        //     enableMouseTracking: false,
		        //     color : '#FF0000',
		        //     lineWidth: 3
		        // },

		    //     {
			   //      name: 'Range Перестановки',
			   //      data: [
						// [ first_value_x, sell_price_min, sell_price_max],
						// [ last_value_x, sell_price_min, sell_price_max]
			   //      ],
			   //      type: 'arearange',
			   //      lineWidth: 0,
			   //      linkedTo: ':previous',
			   //      states: { hover: { lineWidth: 0 } },
			   //      color: '#FF0000',
			   //      fillOpacity: 0.5,
			   //      zIndex: 0,
			   //      marker: {
			   //          enabled: false
			   //      }
		    //     },

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

	// делалось для какого то хуя
	$scope.makeChart = function(trader) {

		var _data = trader.chartData.map(el => {
			return [el.timestamp, el.close, el.timestamp];
			// return [el.close];
		});
		var closeds = trader.closed_orders.filter(el => el.buy_order);

		closeds = _.sortBy(closeds, ['lastModificationTime']);

		var closeds_ok = closeds.filter(el => {
			return (el.quantity * el.price - el.quantity * el.buy_order.price) > 0;
		})
		.map(el => {
			return [
				el.lastModificationTime, 
				_data[_data.length - 1][1], 
				el.lastModificationTime
			];
		});

		var closeds_not_ok = closeds.filter(el => {
			return (el.quantity * el.price - el.quantity * el.buy_order.price) < 0;
		})
		.map(el => {
			return [
				el.lastModificationTime, 
				_data[_data.length - 1][1], 
				el.lastModificationTime
			];
		});
		var data = _data.filter(el => {
			return el[0] > closeds[0].lastModificationTime;
		});

		console.log(closeds);

		let name = 'chart-' + trader.exchange.name;

		console.log('chart id', name);

		
		Highcharts.chart(name, {
			chart : {
				height: 400
			},
			xAxis: {
		        type: 'datetime',
		        dateTimeLabelFormats: {
		           day: '%d %b %Y'    //ex- 01 Jan 2016
		        }
			},
			xAxis: {
				rangeSelector: {
					enabled : true,
					verticalAlign: 'top',
					x: 0,
					y: 0
				},
			},
			scrollbar : {
				enabled : true
			},
            // legend : { enabled : false },
		    // title: { text : null },
		    series: [{ 
		    	type: 'line', 
		    	name: 'BTC/USD', 
		    	data 
		    }, {
		    	name : 'closeds_ok',
				type : 'scatter',
				data : closeds_ok,
				marker : {
					radius : 4,
					fillColor: '#00FF00'
				}
		    },{
		    	name : 'closeds_not_ok',
				type : 'scatter',
				data : closeds_not_ok,
				marker : {
					radius : 4,
					fillColor: '#FF0000'
				}
		    }]
		});

	}
}]);