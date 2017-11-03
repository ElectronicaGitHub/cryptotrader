var mongoose = require('../configs/mongoose.js');
Schema = mongoose.Schema;
ObjectId = Schema.Types.ObjectId;

var Order = new Schema({
	exchangeName : String,
	exchangeId : String,
	currencyPair : String,
	quantity : Number,
	price : Number,
	type : String,
	inBTC : String,
	reason : String,
	orderStatus : String,
	lastModificationTime : Number,
	buyOrderId : {
		type : ObjectId,
		ref : 'Order'
	}
});

module.exports = mongoose.model('Order', Order);
