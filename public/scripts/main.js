angular.module('crypto', []).controller('main', ['$scope', '$http', function($scope, $http) {
	console.log('hello');

	$scope.setTraderSelected = function(trader) {
		$scope.selectedTrader = trader;
	}

	$scope.bot = window.bot;
	$scope.date_long = +new Date();

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
			$scope.setTraderSelected($scope.bot.TRADERS[0]);

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
				return el.inBTC - (el.buy_order ? el.buy_order.inBTC : 0);
			}).reduce(function (a,b) {
				return a + b;
			});

			var today = trader.closed_orders.filter(function (el) {
				return moment($scope.date_long).isSame(el.lastModificationTime, 'd');
			});

			if (today.length) {
				trader.summary.today_incomeInBTC = today.map(function (el) {
					return el.inBTC - (el.buy_order ? el.buy_order.inBTC : 0);
				}).reduce(function (a, b) {
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
				var buy_order = obj.buy.filter(function (el) {
					return el.quantity == obj.sell[j].quantity;
				})[0] || obj.buy[0];

				obj.sell[j].buy_order = buy_order;
			}
			delete obj.buy;

			orders_currencies[i] = obj;
		}

		var orders = [];

		for (let i in orders_currencies) {
			for (let k in orders_currencies[i].sell) {
				orders.push(orders_currencies[i].sell[k]);
			}
		}
		console.log(orders);

		return orders;
	}

	$scope.exchange_pairs_filter = function (el) {
		return el.rank > 0.2;
	}

	$scope.inUSD = function (trader, valueinBTC) {
		return valueinBTC * trader.btc_usd.best_ask;
	}

	$scope.getChartData = function (altcoin, days) {
		$http.post('/getChartData', {
			currencyPair : altcoin.symbol
		}).then(function (data) {
			var data = JSON.parse(data.data);
			console.log(data);

			var prepared_data = data.ohlc.slice(data.ohlc.length - (days * 100)).map((el) => {
				return el[1];
			});

			altcoin.price_change = (prepared_data[prepared_data.length - 1] - prepared_data[0])/prepared_data[0] * 100;

			makeHighchart(altcoin.symbol, prepared_data);
		}, function (error) {
			console.log('error', error);
		});
	}

	function makeHighchart(currencyPair, data) {

		console.log(data);
		
		Highcharts.chart('chart-data-' + currencyPair, {
			chart : {
				height: 120
			},
			xAxis: { title : { text : null } , labels : { enabled : false }},
            yAxis: { title : { text : null },
	            plotLines: [{
	                value: data[0],
	                color: 'green',
	                width: 2,
	                label: {
	                    text: data[0],
                    	align : 'right'
	                }
	            }, {
	                value: data[data.length - 1],
	                color: 'red',
	                width: 2,
	                label: {
	                    text: data[data.length - 1],
                    	align : 'right'
	                }
	            }] 
	        },
            legend : { enabled : false },
		    title: { text : null },
		    series: [{ data }],
		});

	}
}]);