/**
 * External dependencies
 */
const { red, yellow, green } = require( 'chalk' );

module.exports = function( orderGroups = {} ) {
	const {
		cancelledOrders,
		settledOrders,
		newOrders,
		partFilledOrders,
	} = orderGroups;

	console.log( 'Order changes:' )
	newOrders && newOrders.length && console.log( yellow(       '  New:        ' ) + newOrders.length )
	cancelledOrders && cancelledOrders.length && console.log( red(    '  Cancelled:  ' ) + cancelledOrders.length )
	settledOrders && settledOrders.length && console.log( green(    '  Settled:    ' ) + settledOrders.length )
	partFilledOrders && partFilledOrders.length && console.log( green( '  Part Fills: ' ) + partFilledOrders.length )
	console.log( '' );
}
