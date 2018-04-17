var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var app = express();
// var BOT = require('./bot');

var port = process.env.PORT || 8081;
var TRADER = require('./tradeMethods');

var connectors = {
	LiveCoin : require('./connectors/livecoin'),
	Bittrex : require('./connectors/bittrex'),
	Poloniex : require('./connectors/poloniex')
}

app.engine('ejs', require('ejs-locals'));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

app.use(express.static(path.join(__dirname, 'public')));

app.post('/check', function (req, res, next) {

	var data = req.body;
	const exchangeName = data.exchange;
	// const exchangeName = 'Poloniex';
	const key = data.key;
	const secret = data.secret; 

	console.log('income data', data);


	var tr = new TRADER();
	var newConn = new connectors[exchangeName]();
	newConn.init(
		// '97LKCWK-9PA9TPGF-CR4WP6C9-T7ACGEUC',
		key, secret
		// 'd008fde0a6db49ce0d927d4d002ee90e4d4c582d839e84af8c36ea386289958a54b5924238cd9ad18f7a91fadffe1a54bcf1716708ccc0f20b43e0c76a468fdb'
	);

	// newConn.init(
	// 	'D9YG7RNC-0873L17S-RFDYRPUJ-UVAVIWKM',
	// 	'16ee5eb11ccf9c6adba472377090404237880090506ba18c4b80721b17feac2075a0e33459e9dbd302585023a0d9a79f337ca143052e32b98930f02df631ff34'
	// );
	// nonce error
	// this.key = 'D9YG7RNC-0873L17S-RFDYRPUJ-UVAVIWKM'; // Api-key
	// this.secretKey = '16ee5eb11ccf9c6adba472377090404237880090506ba18c4b80721b17feac2075a0e33459e9dbd302585023a0d9a79f337ca143052e32b98930f02df631ff34'; // Sign
	tr.useExchange(newConn);
	tr.check(data => {
		console.log(data);
		res.json({
			success : !data.error
		});
	});


	// console.log(tr);

	// res.send('ok');



});


app.listen(port, function() {
    console.log('Node app is running on port', port);
});


// var bot = new BOT();
// bot.addToTraders('Bittrex');
// bot.addToTraders('Poloniex');