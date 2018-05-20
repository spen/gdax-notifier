/**
 * External dependencies
 */
const GdaxAPI = require( 'gdax' );
const { map, uniq } = require( 'lodash' );
const { NotificationCenter } = require( 'node-notifier' );

/**
 * Internal dependencies
 */
const config = require( '../__c' );
const TradesController = require( './lib/trades' );
const printOrderChanges = require( './lib/print-order-changes' );

const GdaxAuthed = new GdaxAPI.AuthenticatedClient(
	config.KEY,
	config.SECRET,
	config.PASSPHRASE,
	config.USE_SANDBOX ? 'https://api-public.sandbox.gdax.com' : undefined
);
const notifier = new NotificationCenter();
const tradesController = new TradesController( {
	GdaxAuthed,
} );

tradesController.on(
	TradesController.eventKeys.ORDERS_SETTLED,
	( { orders = [] } ) => {
		const markets = uniq( map( orders, 'product_id' ) );
		const link = 'https://www.gdax.com/trade/' + markets[ 0 ] || '';

		notifier.notify( {
			title: `${ orders.length } ${ orders.length > 1 ? 'orders' : 'order' } filled!`,
			message: `In: ${ markets.join( ', ' ) }`,
			sound: 'Purr',
			open: link,
		} );
	}
);

tradesController.on(
	TradesController.eventKeys.ORDERS_CHANGED,
	( { orderGroups } ) => printOrderChanges( orderGroups )
);
