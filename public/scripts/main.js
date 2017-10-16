angular.module('crypto', []).controller('main', ['$scope', '$http', function($scope, $http) {
	console.log('hello');
	$scope.balances = [];
	$scope.btc_rur;
	$scope.exchange_pairs = [];
	$scope.summary = {};
	$scope.closed_pairs;

	$scope.cycle = function () {
		$http.post('/cycle').then(function (data) {
			console.log('success', data.data);
			$scope.balances = data.data.balances;
			$scope.btc_rur = data.data.btc_rur;
			$scope.exchange_pairs = data.data.exchange_pairs;
			$scope.closed_pairs = $scope.makeClosedPairs(data.data.closed_pairs);

			$scope.summary.inBTC = $scope.balances.map(function (el) {
				return el.inBTC;
			}).reduce(function (a,b) {
				return a + b;
			});

			$scope.summary.closed_pairsInBTC = $scope.closed_pairs.map(function (el) {
				return el.inBTC - el.buy_order.inBTC;
			}).reduce(function (a,b) {
				return a + b;
			});


		}, function (error) {
			console.log(error);
		});
	}

	$scope.makeClosedPairs = function (orders_currencies) {
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
				obj.sell[j].buy_order = obj.buy.filter(function (el) {
					return el.quantity == obj.sell[j].quantity;
				})[0];
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

	$scope.inRUR = function (valueinBTC) {
		return valueinBTC * $scope.btc_rur.best_ask;
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