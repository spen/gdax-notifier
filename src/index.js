/**
 * External dependencies
 */
const GdaxAPI = require( 'gdax' );
const { first, map, uniq } = require( 'lodash' );
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

const FLIP_ACTION_LABEL = 'Flip Trade';

tradesController.on(
	TradesController.eventKeys.ORDERS_SETTLED,
	( { orders = [] } ) => {
		const markets = uniq( map( orders, 'product_id' ) );

		notifier.notify( {
			title: `${ orders.length } ${ orders.length > 1 ? 'orders' : 'order' } filled!`,
			message: `In: ${ markets.join( ', ' ) }`,
			sound: 'Purr',
			closeLabel: 'ignore',
			actions: [ FLIP_ACTION_LABEL ],
		}, ( err, response, { activationValue } ) => {
			if ( activationValue === FLIP_ACTION_LABEL ) {
				// Unsure on how best to handle multiple orders... flip all? open a notif for each one?
				// For now lets just flip the first one as there'll usually only ever be one to flip.
				const firstOrder = first( orders );
				tradesController.flipOrder( firstOrder );
			}
		} );
	}
);

tradesController.on(
	TradesController.eventKeys.ORDERS_CHANGED,
	( { orderGroups } ) => printOrderChanges( orderGroups )
);
