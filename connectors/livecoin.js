function LiveCoin() {

	this.name = 'LiveCoin';

	this.baseUrl = 'https://api.livecoin.net';

	this.key = 'PhEaHEtMkgc2JEPua8rAnmktSpk8Xxy8'; // Api-key
	this.secretKey = 'nkq7D46GjFe4e4mrnxvTRVHhxge17B6J'; // Sign

	this.urls = {
		ticker : '/exchange/ticker',
		clientOrders : '/exchange/client_orders',
		getBalance : '/payment/balances',
		getChartData : 'https://www.livecoin.net/tradeapi/mainGraphData', // period=m15&currencyPair=BTC%2FUSD
		buyLimit : '/exchange/buylimit',
		sellLimit : '/exchange/selllimit',
		cancelLimit : '/exchange/cancellimit'
	}

	this.pipes = {
		makeBalances : function (data) {
			data = data.map(function (el) {
				return {
					type : el.type,
					value : el.value,
					currency : el.currency
				}
			});

			available = data.filter(function (el) {
				return el.value != 0 && (el.type == 'available');
			});
			total = data.filter(function (el) {
				return el.value != 0 && (el.type == 'total');
			});

			return {
				total : total,
				available : available
			}

			// return data;

		},
		makeCurrencies : function (data) {
			return data.map(function (el) {
				return {
					symbol : el.symbol,
					best_ask : el.best_ask,
					best_bid : el.best_bid,
					currency : el.cur,
					volume : el.volume
				}
			});
		},
		makeOrders : function (data) {

			data = data.data.map(function (el) {
				return {
					id : el.id,
					currencyPair : el.currencyPair,
					quantity : el.quantity,
					price : el.price,
					type : el.type,
					inBTC : el.quantity * el.price,
					orderStatus : el.orderStatus,
					lastModificationTime : el.lastModificationTime
				}
			});

			return {
				open_sell_orders : data.filter(function (el) {
					return el.type == 'LIMIT_SELL' && el.orderStatus == 'OPEN';
				}),
				open_buy_orders : data.filter(function (el) {
					return el.type == 'LIMIT_BUY' && el.orderStatus == 'OPEN';
				}),
				closed_buy_orders : data.filter(function (el) {
					return el.type == 'LIMIT_BUY' && el.orderStatus == 'EXECUTED';
				}),
				closed_orders : data.filter(function (el) {
					return el.orderStatus == 'EXECUTED';
				})
			}
		}
	}
}
	
module.exports = LiveCoin;