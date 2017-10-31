var kue = require('kue');
var jobs = kue.createQueue();

console.log('hello');

kue.app.listen(3333);

data = {};

var create = function () {
	job = jobs.create('start trade cycle', {
		title : 'trade cycle: Bittrex',
		exchange : 'Bittrex',
		data : {
			pairs : ['a', 'b']
		}
	});

	job
		.on( 'complete', function () {
	    	console.log( " Job complete" );
		}).on( 'failed', function () {
	    	console.log( " Job failed" );
		});

	job.removeOnComplete(true).save();
}

setInterval(create, 1000);

jobs.process('start trade cycle', 3, function (job, done) {

	setTimeout(function () {
		console.log(job.data);
		done();
	}, 5000);
});