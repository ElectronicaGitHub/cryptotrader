var regression = require('./regression');
var _ = require('lodash');

function AnalyticsModule() {
	this.params = {
		// насколько от нижней границы в процентах заходить на покупку
		percent_from_min_to_base : 60,
		// процент разницы в значениях в начале и в конце графа
		percent_graph_raise_value : 1.5,
		// куда стараемся переставить переставить
		// от одной границы до другой, неподошло в одну смотрим другую и тд
		percent_from_base_to_max_to_buy_min : 40,
		percent_from_base_to_max_to_buy_max : 70,
		percent_from_base_to_max_step : 10,
		min_profit_percent : 0.8
	}
}

AnalyticsModule.prototype.setParams = function (params) {
	this.params = params;
}

AnalyticsModule.prototype.analyze = function (trader, pair) {

	data = trader.pairs_graph_data[pair.symbol];

	if (!data) return;

	data = data.map((el, n) => [el.timestamp, +el.best_ask, 1]);

	y_min = _.minBy(data, 1);
	y_max = _.maxBy(data, 1);
	x_max = _.maxBy(data, 0);

	lines = this.makeLines(data);

	values = {};

	pair.lines = lines;
	pair.diff_value = (data[0][1] - y_min[1])/y_min[1] * 100;
	pair.spread_value = (y_max[1] - y_min[1])/y_min[1] * 100;
	pair.baseline_m = lines.baseLine.m;
	pair.buyMomentChartData = data.map(el => el[1]);
	
	// первое значение
	let first_value_x = data[0][0];
	// последнее значение x и y
	let last_value_x = data[data.length - 1][0];
	let last_value_y = data[data.length - 1][1];
	// первое значение y на базовой регрессии
	let first_base_y = pair.first_base_y = lines.baseLine.m * first_value_x + lines.baseLine.b;
	let first_min_y = lines.minLine.m * first_value_x + lines.minLine.b;
	let first_max_y = lines.maxLine.m * first_value_x + lines.maxLine.b;
	// последнее значение y на максимальной регрессии
	let last_max_y = lines.maxLine.m * last_value_x + lines.maxLine.b;
	// последнее значение y на базовой регрессии
	let last_base_y = pair.last_base_y = lines.baseLine.m * last_value_x + lines.baseLine.b;
	// последнее значение y на минимальной регрессии
	let last_min_y = lines.minLine.m * last_value_x + lines.minLine.b;
	// разницы от/до в y
	let diff_from_min_to_base = last_base_y - last_min_y;
	let diff_from_min_to_max = last_max_y - last_min_y;
	let diff_from_base_to_max = last_max_y - last_base_y;
	// процентная разница нашего значения в промежутке между минимумом и базой
	let percent_from_min_to_base = (last_value_y - last_min_y)/(diff_from_min_to_base) * 100;
	// процентная разница нашего значения в промежутке между минимумом и максимумом
	let percent_from_min_to_max = (last_value_y - last_min_y)/(diff_from_min_to_max) * 100;
	// получаем наши линии
	lines = this.makeLines(data, diff_from_min_to_base);

	// коэффициент роста нашего графа по базовой регрессии
	pair.percent_graph_raise_value = (last_base_y - first_base_y) / first_base_y * 100;

	// считаем прибыль при покупке в текущий момент
	let current_ask = +pair.best_ask;
	let quantity = trader.exchange.max_buy_order_price / current_ask;
	// let tax =(current_ask * quantity) * ( 2 * trader.exchange.exchange_fee);
	let price_in_btc = current_ask * quantity; // понимаем цену в битках
	// let profit_price_in_btc = (price_in_btc * (100 + +trader.exchange.profit_koef) / 100) + tax;
	// let sell_price = profit_price_in_btc / quantity;

	// переставляем через добавление низ->средняя
	// let sell_price = current_ask + diff_from_min_to_base;
	// 
	// переставляем через процент средняя->мах
	// let sell_price_min = current_ask + (diff_from_base_to_max * this.params.percent_from_base_to_max_to_buy_min / 100);
	// let sell_price_max = current_ask + (diff_from_base_to_max * this.params.percent_from_base_to_max_to_buy_max / 100);
	// 
	// 

	// Подготовка данных

	let percent_profit = 0;
	// let percent_profit_min = 0;
	// let percent_profit_max = 0;
	let current_percent_from_base_to_max = this.params.percent_from_base_to_max_to_buy_min;

	let sell_price, sell_price_min, sell_price_max;
	let tax, tax_min, tax_max;
	let new_price_in_btc, new_price_in_btc_min, new_price_in_btc_max;
	let usd_profit, usd_profit_min, usd_profit_max;

	// цикл увеличения процента при недостаточном профите
	// заложен в параметрах
	do {
		sell_price = last_base_y + (last_max_y - last_base_y) * current_percent_from_base_to_max / 100;
		// sell_price_min = last_base_y + (last_max_y - last_base_y) * this.params.percent_from_base_to_max_to_buy_min / 100;
		// sell_price_max = last_base_y + (last_max_y - last_base_y) * this.params.percent_from_base_to_max_to_buy_max / 100;

		tax = (sell_price * quantity) * (trader.exchange.exchange_fee * 2);
		// tax_min = (sell_price_min * quantity) * (trader.exchange.exchange_fee * 2);
		// tax_max = (sell_price_max * quantity) * (trader.exchange.exchange_fee * 2);

		new_price_in_btc = (sell_price + tax) * quantity;
		// new_price_in_btc_min = (sell_price_min + tax_min) * quantity;
		// new_price_in_btc_max = (sell_price_max + tax_max) * quantity;

		percent_profit = ((new_price_in_btc - price_in_btc) / price_in_btc * 100);
		// percent_profit_min = ((new_price_in_btc_min - price_in_btc) / price_in_btc * 100).toFixed(3);
		// percent_profit_max = ((new_price_in_btc_max - price_in_btc) / price_in_btc * 100).toFixed(3);

		usd_profit = (new_price_in_btc - price_in_btc) * trader.btc_usd.best_ask;
		// usd_profit_min = (new_price_in_btc_min - price_in_btc) * trader.btc_usd.best_ask;
		// usd_profit_max = (new_price_in_btc_max - price_in_btc) * trader.btc_usd.best_ask;

		// прибавляем процент перестановки
		current_percent_from_base_to_max += this.params.percent_from_base_to_max_step;

	} while (
		(percent_profit <= this.params.min_profit_percent) && 
		(current_percent_from_base_to_max < this.params.percent_from_base_to_max_to_buy_max)
	);

	// Нашли перестановку, определили процент профита
	// Если перестановка при текущей покупке лежит в должном проценте от линии
	// базовой регрессии то покупаем пару и переставляем именно на эту цену

	let exs = [];
	// текущее значение больше минимума регрессии
	// exs.push(last_value_y >= last_min_y);
	// текущее значение меньше базовой регрессии
	exs.push(last_value_y < last_base_y);
	// затухание тренда не больше чем коэффициент
	exs.push(pair.percent_graph_raise_value > -this.params.percent_graph_raise_value);
	// последняя точка выше предыдущей
	exs.push(last_value_y > data[data.length - 2][1]);
	// нахождение в зоне между минимумом и базой !!!
	// exs.push(percent_from_min_to_base < this.params.percent_from_min_to_base);
	// профит больше чем минимально допустимый
	exs.push(percent_profit > this.params.min_profit_percent);

	pair.is_pair_acceptable = exs.reduce((a, b) => a && b);

	if (pair.is_pair_acceptable) {
		console.log(trader.exchange.name, pair.symbol, current_percent_from_base_to_max,
					percent_profit.toFixed(3) + ' (' + usd_profit.toFixed(3) + ' USD)', 
					// percent_profit_min + ' (' + usd_profit_min.toFixed(3) + ' USD) -', 
					// percent_profit_max + ' (' + usd_profit_max.toFixed(3) + ' USD)'
		);
	}

	return { lines, values : {
		first_value_x,
		last_value_x,
		last_value_y,
		first_base_y,
		first_min_y,
		first_max_y,
		last_max_y,
		last_base_y,
		last_min_y,
		diff_from_min_to_base,
		diff_from_min_to_max,
		diff_from_base_to_max,
		percent_from_min_to_base,
		percent_from_min_to_max,
		sell_price
	} }
}

AnalyticsModule.prototype.makeLines = function(data, diff_from_min_to_base)  {

	let slope = regression('linear', data);

	let m = slope.equation[0], b = slope.equation[1];
	let xs = [], ys = [];

	data.forEach(function(d){
	   	xs.push(d[0]);
	    ys.push(d[1]);
	});

	let diffData = data.map(([x,y]) => {
		return [x, y - (m*x + b)]
	});

	let min = _.minBy(diffData, 1);
	let max = _.maxBy(diffData, 1);

	let x0 = Math.min.apply(null, xs), 
	    y0 = m*x0 + b;
	let xf = Math.max.apply(null, xs), 
	    yf = m*xf + b;

    let y0max = y0 + max[1];
    let y0min = y0 + min[1];
	let yfmax = yf + max[1];
    let yfmin = yf + min[1];

    let addition = diff_from_min_to_base * this.params.percent_from_min_to_base / 100;

	let baseLine = [{ x : x0, y : y0 }, { x: xf, y : yf}];
    let minLine = [{x : x0, y : y0min}, {x : xf, y : yfmin}];
    let minPercentageLine = [
    	{x : x0, y : y0min + addition }, 
    	{x : xf, y : yfmin + addition }
    ];
    let maxLine = [{x : x0, y : y0max}, {x : xf, y : yfmax}];

    let minEquation = { 
    	m : (minLine[1].y - minLine[0].y) / (minLine[1].x - minLine[0].x), 
    	b : ((minLine[1].x * minLine[0].y) - (minLine[0].x * minLine[1].y)) / (minLine[1].x - minLine[0].x) 
    };

    let maxEquation = { 
    	m : (maxLine[1].y - maxLine[0].y) / (maxLine[1].x - maxLine[0].x), 
    	b : ((maxLine[1].x * maxLine[0].y) - (maxLine[0].x * maxLine[1].y)) / (maxLine[1].x - maxLine[0].x) 
    };

    let minPercentageEquation = { 
    	m : (minPercentageLine[1].y - minPercentageLine[0].y) / (minPercentageLine[1].x - minPercentageLine[0].x), 
    	b : ((minPercentageLine[1].x * minPercentageLine[0].y) - (minPercentageLine[0].x * minPercentageLine[1].y)) / (minPercentageLine[1].x - minPercentageLine[0].x) 
    };

	return {
		baseLine : {data: baseLine, m, b },
		minLine : { data: minLine, m : minEquation.m, b : minEquation.b },
		maxLine : { data: maxLine, m : maxEquation.m, b : maxEquation.b },
		minPercentageLine : {data : minPercentageLine, m : minPercentageEquation.m, b : minPercentageEquation.b }
	}
}

module.exports = AnalyticsModule;