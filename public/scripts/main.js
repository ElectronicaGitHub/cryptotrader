angular.module('crypto', []).controller('main', ['$scope', '$http', function($scope, $http) {
	console.log('hello');

	let params = {
		percent_from_min_to_base : 60,
		percent_graph_raise_value : 1
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
						return el.price * el.quantity - b_order.price * el.quantity;
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

		// data = data.map((el, n) => [n * 0.0001, el.close, 1]);
		// data = data.map((el, n) => [n, el.close]);
		data = data.map((el, n) => [el.timestamp, el.best_ask, 1]);
		y_min = _.minBy(data, 1);
		y_max = _.maxBy(data, 1);

		x_max = _.maxBy(data, 0);

		// data = data.map((el, n) => [y_min[1] + (n * (y_max[1] - y_min[1])/data.length), el[1]]);

		// data = data.map(el => [el[0]/x_max[0], el[1]/y_max[1], 1]);
		// data = data.map(el => [x_max[0] - el[0], y_max[1] - el[1], 1]);

		// console.log(data);

		lines = makeLines(data);

		pair.lines = lines;
		pair.diff_value = (data[0][1] - y_min[1])/y_min[1] * 100;
		pair.spread_value = (y_max[1] - y_min[1])/y_min[1] * 100;
		pair.baseline_m = lines.baseLine.m;

		// рассматриваем что последняя точка находится в нижнем коридоре
		
		let first_value_x = data[0][0];
		let last_value_x = data[data.length - 1][0];
		let last_value_y = data[data.length - 1][1];

		let first_base_y = pair.first_base_y = lines.baseLine.m * first_value_x + lines.baseLine.b;
		let last_max_y = lines.maxLine.m * last_value_x + lines.maxLine.b;

		let last_base_y = pair.last_base_y = lines.baseLine.m * last_value_x + lines.baseLine.b;
		let last_min_y = lines.minLine.m * last_value_x + lines.minLine.b;


		let diff_from_min_to_base = last_base_y - last_min_y;
		let diff_from_min_to_max = last_max_y - last_min_y;
		let percent_from_min_to_base = (last_value_y - last_min_y)/(diff_from_min_to_base) * 100;
		let percent_from_min_to_max = (last_value_y - last_min_y)/(diff_from_min_to_max) * 100;

		lines = makeLines(data, diff_from_min_to_base);

		console.log(pair.symbol);
		console.log(lines);
		// console.log('y_max[1]', y_max[1]);
		// console.log('y_min[1]', y_min[1]);

		console.log('function max value', last_max_y);
		console.log('function base value', last_base_y);
		console.log('function min value', last_min_y);
		console.log('last value', last_value_y);	
	
		console.log('diff_from_min_to_base', diff_from_min_to_base);
		console.log('diff_from_min_to_max', diff_from_min_to_max);

		console.log('percent from min to base', percent_from_min_to_base);
		console.log('percent from min to max', percent_from_min_to_max);

		console.log('percent_graph_raise_value', Math.abs((last_base_y - first_base_y) / first_base_y * 100));

		if (last_value_y > last_min_y && 
			last_value_y < last_base_y && 
			// Math.abs(pair.spread_value) > 3 && // ???
			(last_base_y - first_base_y) / first_base_y * 100 > -params.percent_graph_raise_value &&  
			last_value_y > data[data.length - 2][1] &&
			percent_from_min_to_base < params.percent_from_min_to_base) {
			pair.is_graph_acceptable = true;			
		}

		// pair.is_graph_acceptable = Math.abs(pair.spread_value) > 3;


		(function (data, lines) {
			setTimeout(function () {
				Highcharts.chart('graph-' + pair.symbol, {
					chart : {
						height: 300
					},
					xAxis: {
				        type: 'datetime'
					},
					title : { text : null },
				    series: [
				    {
			            type: 'line',
			            name: 'Regression Line',
			            data: [[lines.baseLine.data[0].x, lines.baseLine.data[0].y], [lines.baseLine.data[1].x, lines.baseLine.data[1].y]], 
			            marker: { enabled: false },
			            states: { hover: { lineWidth: 0 } },
			            enableMouseTracking: false
			        },
			        {
			            type: 'line',
			            name: 'Regression Line Min',
			            data: [[lines.minLine.data[0].x, lines.minLine.data[0].y], [lines.minLine.data[1].x, lines.minLine.data[1].y]], 
			            // data: [[test_x0, test_y0], [test_xf, test_yf]], 
			            marker: { enabled: false },
			            states: { hover: { lineWidth: 0 } },
			            enableMouseTracking: false
			        },
			        {
			            type: 'line',
			            name: 'Regression Line Max',
			            data: [[lines.maxLine.data[0].x, lines.maxLine.data[0].y], [lines.maxLine.data[1].x, lines.maxLine.data[1].y]], 
			            // data: [[max_test_x0, max_test_y0], [max_test_xf, max_test_yf]], 
			            marker: { enabled: false },
			            states: { hover: { lineWidth: 0 } },
			            enableMouseTracking: false
			        },
					{
			            type: 'line',
			            name: 'Regression Line Min Percentage',
			            data: [[lines.minPercentageLine.data[0].x, lines.minPercentageLine.data[0].y], [lines.minPercentageLine.data[1].x, lines.minPercentageLine.data[1].y]], 
			            // data: [[max_test_x0, max_test_y0], [max_test_xf, max_test_yf]], 
			            marker: { enabled: false },
			            states: { hover: { lineWidth: 0 } },
			            enableMouseTracking: false
			        },
			        { 
				    	type: 'line', 
				    	name: 'BTC/USD', 
				    	data 
				    }]
				});
			});
		})(data, lines);
	}

	let makeLines = (data, diff_from_min_to_base) => {

		var slope = regression('linear', data);
		// var slope = linear_regression(data);

		console.log(slope);

		var m = slope.equation[0], b = slope.equation[1];
		// var m = slope[0], b = slope[1];
		var xs = [], ys = [];

		// console.log('|arctan(' +  m  + ')| =', Math.abs(Math.atan(m)));
		// console.log('|arctan(' +  m  + ')| < 0.17', Math.abs(Math.atan(m)) < 0.17);

		// console.log(slope);

		data.forEach(function(d){
		   	xs.push(d[0]);
		    ys.push(d[1]);
		});



		var diffData = data.map(([x,y]) => {
			return [x, y - (m*x + b)]
		});

		// console.log(diffData);

		var min = _.minBy(diffData, 1);
		var max = _.maxBy(diffData, 1);

		// console.log('min diff', min);
		// console.log('max diff', max);

	    // console.log('x0', x0);
	    // console.log('y0', y0);
	    // console.log('xf', xf);
	    // console.log('yf', yf);

		var x0 = Math.min.apply(null, xs), 
		    y0 = m*x0 + b;
		var xf = Math.max.apply(null, xs), 
		    yf = m*xf + b;
		    
	    var y0max = y0 + max[1];
	    var y0min = y0 + min[1];
		var yfmax = yf + max[1];
	    var yfmin = yf + min[1];

	    let addition = diff_from_min_to_base * params.percent_from_min_to_base / 100;

	    console.log('addition', addition);

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

	let linear_regression = ( xyr ) => {
	    var i, 
	        x, y, r,
	        sumx=0, sumy=0, sumx2=0, sumy2=0, sumxy=0, sumr=0,
	        a, b;

	    for(i=0;i<xyr.length;i++) {   
	        // this is our data pair
	        x = xyr[i][0]; y = xyr[i][1]; 

	        // this is the weight for that pair
	        // set to 1 (and simplify code accordingly, ie, sumr becomes xy.length) if weighting is not needed
	        r = xyr[i][2];  

	        // consider checking for NaN in the x, y and r variables here 
	        // (add a continue statement in that case)

	        sumr += r;
	        sumx += r*x;
	        sumx2 += r*(x*x);
	        sumy += r*y;
	        sumy2 += r*(y*y);
	        sumxy += r*(x*y);
	    }

	    // note: the denominator is the variance of the random variable X
	    // the only case when it is 0 is the degenerate case X==constant
	    b = (sumy*sumx2 - sumx*sumxy)/(sumr*sumx2-sumx*sumx);
	    a = (sumr*sumxy - sumx*sumy)/(sumr*sumx2-sumx*sumx);

	    return [a, b];
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