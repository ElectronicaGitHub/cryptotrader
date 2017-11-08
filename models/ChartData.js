var mongoose = require('../configs/mongoose.js');
Schema = mongoose.Schema;
ObjectId = Schema.Types.ObjectId;

var ChartData = new Schema({
	exchangeName : String,
	json : String
});

module.exports = mongoose.model('ChartData', ChartData);
