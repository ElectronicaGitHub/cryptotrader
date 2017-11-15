var mongoose = require('../configs/mongoose.js');
Schema = mongoose.Schema;
ObjectId = Schema.Types.ObjectId;

var Balance = new Schema({
	exchangeName : String,
	total : Number,
	available : Number,
	timestamp : {
		type : Date,
		default : Date.now
	}
});

module.exports = mongoose.model('Balance', Balance);
