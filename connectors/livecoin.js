function LiveCoin() {

	this.name = 'LiveCoin';

	this.baseUrl = 'https://api.livecoin.net';

	this.key = 'PhEaHEtMkgc2JEPua8rAnmktSpk8Xxy8'; // Api-key
	this.secretKey = 'nkq7D46GjFe4e4mrnxvTRVHhxge17B6J'; // Sign

	this.urls = {
		ticker : '/exchange/ticker',
		clientOrders : '/exchange/client_orders',
		getBalance : '/payment/balances',
		getChartData : 'https://www.livecoin.net/tradeapi/mainGraphData' // period=m15&currencyPair=BTC%2FUSD
	}
}
	
module.exports = LiveCoin;