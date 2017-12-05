angular.module('crypto').directive('closedOrder', [function() {
	// Runs during compile
	return {
		// name: '',
		// priority: 1,
		// terminal: true,
		scope: { 
			pair : '=pair',
			trader : '=trader',
			graphFn : '&'
		 }, // {} = isolate, true = child, false/undefined = no change
		// controller: function($scope, $element, $attrs, $transclude) {},
		// require: 'ngModel', // Array = multiple requires, ? = optional, ^ = check parent elements
		// restrict: 'A', // E = Element, A = Attribute, C = Class, M = Comment
		// template: '',
		templateUrl: 'scripts/closed_order.directive.html',
		// replace: true,
		// transclude: true,
		// compile: function(tElement, tAttrs, function transclude(function(scope, cloneLinkingFn){ return function linking(scope, elm, attrs){}})),
		link: function($scope, iElm, iAttrs, controller) {
			$scope.moment = moment;

			$scope.show_full_closed_orders_info = true;

			$scope.inUSD = function (trader, valueinBTC) {
				return valueinBTC * trader.btc_usd.best_ask;
			}
			$scope.$parent.$watch('show_full_closed_orders_info', function () {
				$scope.show_full_closed_orders_info = !$scope.show_full_closed_orders_info;

			});
			$scope.callMakeGraphForClosedOrder = function (trader, pair) {
				$scope.graphFn()(trader, pair);
			}
					
		}
	};
}]);