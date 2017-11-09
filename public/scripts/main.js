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
					return el.price * el.quantity - b_order.price * el.quantity;
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
						return el.price * el.quantity - b_order.price * b_order.quantity;
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

	// $scope.getChartData = function (altcoin, days) {
	// 	$http.post('/getChartData', {
	// 		currencyPair : altcoin.symbol
	// 	}).then(function (data) {
	// 		var data = JSON.parse(data.data);
	// 		console.log(data);

	// 		var prepared_data = data.ohlc.slice(data.ohlc.length - (days * 100)).map((el) => {
	// 			return el[1];
	// 		});

	// 		altcoin.price_change = (prepared_data[prepared_data.length - 1] - prepared_data[0])/prepared_data[0] * 100;

	// 		makeHighchart(altcoin.symbol, prepared_data);
	// 	}, function (error) {
	// 		console.log('error', error);
	// 	});
	// }

	$scope.makeGraph = function (trader, pair) {

		data = trader.pairs_graph_data[pair.symbol];

		if (!data) return;

		data = data.map((el, n) => [el.timestamp, +el.best_ask, 1]);

		y_min = _.minBy(data, 1);
		y_max = _.maxBy(data, 1);
		x_max = _.maxBy(data, 0);

		lines = makeLines(data);

		pair.lines = lines;
		pair.diff_value = (data[0][1] - y_min[1])/y_min[1] * 100;
		pair.spread_value = (y_max[1] - y_min[1])/y_min[1] * 100;
		pair.baseline_m = lines.baseLine.m;
		
		// первое значение
		let first_value_x = data[0][0];
		// последнее значение x и y
		let last_value_x = data[data.length - 1][0];
		let last_value_y = data[data.length - 1][1];
		// первое значение y на базовой регрессии
		let first_base_y = pair.first_base_y = lines.baseLine.m * first_value_x + lines.baseLine.b;
		let first_min_y = lines.minLine.m * first_value_x + lines.minLine.b;
		let first_max_y = lines.maxLine.m * first_value_x + lines.maxLine.b;
		// последнее значение y на максимальной регрессии
		let last_max_y = lines.maxLine.m * last_value_x + lines.maxLine.b;
		// последнее значение y на базовой регрессии
		let last_base_y = pair.last_base_y = lines.baseLine.m * last_value_x + lines.baseLine.b;
		// последнее значение y на минимальной регрессии
		let last_min_y = lines.minLine.m * last_value_x + lines.minLine.b;
		// разницы от/до в y
		let diff_from_min_to_base = last_base_y - last_min_y;
		let diff_from_min_to_max = last_max_y - last_min_y;
		let diff_from_base_to_max = last_max_y - last_base_y;
		// процентная разница нашего значения в промежутке между минимумом и базой
		let percent_from_min_to_base = (last_value_y - last_min_y)/(diff_from_min_to_base) * 100;
		// процентная разница нашего значения в промежутке между минимумом и максимумом
		let percent_from_min_to_max = (last_value_y - last_min_y)/(diff_from_min_to_max) * 100;
		// получаем наши линии
		lines = makeLines(data, diff_from_min_to_base);

		// коэффициент роста нашего графа по базовой регрессии
		pair.percent_graph_raise_value = (last_base_y - first_base_y) / first_base_y * 100;

		// считаем прибыль при покупке в текущий момент
		let current_ask = +pair.best_ask;
		let quantity = trader.exchange.max_buy_order_price / current_ask;
		// let tax =(current_ask * quantity) * ( 2 * trader.exchange.exchange_fee);
		let price_in_btc = current_ask * quantity; // понимаем цену в битках
		// let profit_price_in_btc = (price_in_btc * (100 + +trader.exchange.profit_koef) / 100) + tax;
		// let sell_price = profit_price_in_btc / quantity;
	
		// переставляем через добавление низ->средняя
		// let sell_price = current_ask + diff_from_min_to_base;
		// 
		// переставляем через процент средняя->мах
		// let sell_price_min = current_ask + (diff_from_base_to_max * params.percent_from_base_to_max_to_buy_min / 100);
		// let sell_price_max = current_ask + (diff_from_base_to_max * params.percent_from_base_to_max_to_buy_max / 100);
		// 
		// 

		// Подготовка данных

		let percent_profit = 0;
		// let percent_profit_min = 0;
		// let percent_profit_max = 0;
		let current_percent_from_base_to_max = params.percent_from_base_to_max_to_buy_min;

		let sell_price, sell_price_min, sell_price_max;
		let tax, tax_min, tax_max;
		let new_price_in_btc, new_price_in_btc_min, new_price_in_btc_max;
		let usd_profit, usd_profit_min, usd_profit_max;

		do {
			sell_price = last_base_y + (last_max_y - last_base_y) * current_percent_from_base_to_max / 100;
			// sell_price_min = last_base_y + (last_max_y - last_base_y) * params.percent_from_base_to_max_to_buy_min / 100;
			// sell_price_max = last_base_y + (last_max_y - last_base_y) * params.percent_from_base_to_max_to_buy_max / 100;

			tax = (sell_price * quantity) * (trader.exchange.exchange_fee * 2);
			// tax_min = (sell_price_min * quantity) * (trader.exchange.exchange_fee * 2);
			// tax_max = (sell_price_max * quantity) * (trader.exchange.exchange_fee * 2);

			new_price_in_btc = (sell_price + tax) * quantity;
			// new_price_in_btc_min = (sell_price_min + tax_min) * quantity;
			// new_price_in_btc_max = (sell_price_max + tax_max) * quantity;

			percent_profit = ((new_price_in_btc - price_in_btc) / price_in_btc * 100);
			// percent_profit_min = ((new_price_in_btc_min - price_in_btc) / price_in_btc * 100).toFixed(3);
			// percent_profit_max = ((new_price_in_btc_max - price_in_btc) / price_in_btc * 100).toFixed(3);

			usd_profit = (new_price_in_btc - price_in_btc) * trader.btc_usd.best_ask;
			// usd_profit_min = (new_price_in_btc_min - price_in_btc) * trader.btc_usd.best_ask;
			// usd_profit_max = (new_price_in_btc_max - price_in_btc) * trader.btc_usd.best_ask;

			// прибавляем процент перестановки
			current_percent_from_base_to_max += params.percent_from_base_to_max_step;

		} while (
			(percent_profit <= params.min_profit_percent) && 
			(current_percent_from_base_to_max < params.percent_from_base_to_max_to_buy_max)
		);


		console.log(trader.exchange.name, pair.symbol, current_percent_from_base_to_max,
					percent_profit.toFixed(3) + ' (' + usd_profit.toFixed(3) + ' USD)', 
					// percent_profit_min + ' (' + usd_profit_min.toFixed(3) + ' USD) -', 
					// percent_profit_max + ' (' + usd_profit_max.toFixed(3) + ' USD)'
		);

		// Нашли перестановку, определили процент профита
		// Если перестановка при текущей покупке лежит в должном проценте от линии
		// базовой регрессии то покупаем пару и переставляем именно на эту цену

		let exs = [];
		// текущее значение больше минимума регрессии
		// exs.push(last_value_y >= last_min_y);
		// текущее значение меньше базовой регрессии
		exs.push(last_value_y < last_base_y);
		// затухание тренда не больше чем коэффициент
		// exs.push(pair.percent_graph_raise_value > -params.percent_graph_raise_value);
		// последняя точка выше предыдущей
		// exs.push(last_value_y > data[data.length - 2][1]);
		// нахождение в зоне между минимумом и базой
		// exs.push(percent_from_min_to_base < params.percent_from_min_to_base);
		// профит больше чем минимально допустимый
		exs.push(percent_profit > params.min_profit_percent);

		pair.is_graph_acceptable = exs.reduce((a, b) => a && b);

		(function (data, lines) {
			setTimeout(function () {
				Highcharts.chart('graph-' + trader.exchange.name + '-' + pair.symbol, {
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
			            	[lines.baseLine.data[0].x, sell_price], 
			            	[lines.baseLine.data[1].x, sell_price]
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
							[ first_value_x, first_min_y, first_max_y],
							[ last_value_x, last_min_y, last_max_y]
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
		})(data, lines);
	}

	let makeLines = (data, diff_from_min_to_base) => {

		let slope = regression('linear', data);

		let m = slope.equation[0], b = slope.equation[1];
		let xs = [], ys = [];

		data.forEach(function(d){
		   	xs.push(d[0]);
		    ys.push(d[1]);
		});

		let diffData = data.map(([x,y]) => {
			return [x, y - (m*x + b)]
		});

		let min = _.minBy(diffData, 1);
		let max = _.maxBy(diffData, 1);

		let x0 = Math.min.apply(null, xs), 
		    y0 = m*x0 + b;
		let xf = Math.max.apply(null, xs), 
		    yf = m*xf + b;

	    let y0max = y0 + max[1];
	    let y0min = y0 + min[1];
		let yfmax = yf + max[1];
	    let yfmin = yf + min[1];

	    let addition = diff_from_min_to_base * params.percent_from_min_to_base / 100;

		let baseLine = [{ x : x0, y : y0 }, { x: xf, y : yf}];
	    let minLine = [{x : x0, y : y0min}, {x : xf, y : yfmin}];
	    let minPercentageLine = [
	    	{x : x0, y : y0min + addition }, 
	    	{x : xf, y : yfmin + addition }
	    ];
	    let maxLine = [{x : x0, y : y0max}, {x : xf, y : yfmax}];

	    let minEquation = { 
	    	m : (minLine[1].y - minLine[0].y) / (minLine[1].x - minLine[0].x), 
	    	b : ((minLine[1].x * minLine[0].y) - (minLine[0].x * minLine[1].y)) / (minLine[1].x - minLine[0].x) 
	    };

	    let maxEquation = { 
	    	m : (maxLine[1].y - maxLine[0].y) / (maxLine[1].x - maxLine[0].x), 
	    	b : ((maxLine[1].x * maxLine[0].y) - (maxLine[0].x * maxLine[1].y)) / (maxLine[1].x - maxLine[0].x) 
	    };

	    let minPercentageEquation = { 
	    	m : (minPercentageLine[1].y - minPercentageLine[0].y) / (minPercentageLine[1].x - minPercentageLine[0].x), 
	    	b : ((minPercentageLine[1].x * minPercentageLine[0].y) - (minPercentageLine[0].x * minPercentageLine[1].y)) / (minPercentageLine[1].x - minPercentageLine[0].x) 
	    };

		return {
			baseLine : {data: baseLine, m, b },
			minLine : { data: minLine, m : minEquation.m, b : minEquation.b },
			maxLine : { data: maxLine, m : maxEquation.m, b : maxEquation.b },
			minPercentageLine : {data : minPercentageLine, m : minPercentageEquation.m, b : minPercentageEquation.b }
		}
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