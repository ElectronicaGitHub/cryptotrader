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
	},
	analyticsResult : {
		type : String,
		set : function (val) {
			return JSON.stringify(val);
		},
		get : function (string) {
			return JSON.parse(string);
		}
	},
	buyMomentChartData : {
		type : String,
		set : function (val) {
			return JSON.stringify(val);
		},
		get : function (string) {
			return JSON.parse(string);
		}	
	}
});
Order.set('toObject', { getters: true });
Order.set('toJSON', { getters: true });

module.exports = mongoose.model('Order', Order);
