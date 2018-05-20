/**
 * External dependencies
 */
const chalk = require( 'chalk' );
const { red, yellow, green } = chalk;

module.exports = function( orderGroups = {} ) {
	const {
		cancelledOrders,
		settledOrders,
		newOrders,
		partFilledOrders,
	} = orderGroups;

	console.log( 'Order changes:' )
	newOrders.length && console.log( yellow(       '  New:        ' ) + newOrders.length )
	cancelledOrders.length && console.log( red(    '  Cancelled:  ' ) + cancelledOrders.length )
	settledOrders.length && console.log( green(    '  Settled:    ' ) + settledOrders.length )
	partFilledOrders.length && console.log( green( '  Part Fills: ' ) + partFilledOrders.length )
	console.log( '' );
}