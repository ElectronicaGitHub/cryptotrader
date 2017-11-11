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
			return val ? JSON.stringify(val) : null;
		},
		get : function (string) {
			return string ? JSON.parse(string) : null;
		}
	},
	buyMomentChartData : {
		type : String,
		set : function (val) {
			return val ? JSON.stringify(val) : null;
		},
		get : function (string) {
			return string ? JSON.parse(string) : null;
		}	
	},
	analyticsParams : {
		type : String,
		set : function (val) {
			return val ? JSON.stringify(val) : null;
		},
		get : function (string) {
			return string ? JSON.parse(string) : null;
		}
	}
});
Order.set('toObject', { getters: true });
Order.set('toJSON', { getters: true });

module.exports = mongoose.model('Order', Order);
