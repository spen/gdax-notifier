/**
 * External dependencies
 */
const Emitter = require( 'events' );
const {
	filter,
	get,
	isEmpty,
	map,
	difference,
	includes,
	bindAll,
	toNumber,
	some,
	omit,
} = require( 'lodash' );

const logAll = console.log.bind( console );
const IS_CANCELLED_STATUS = 'isCancelled';

const isOrderCancelled = order => get( order, 'status' ) === IS_CANCELLED_STATUS;
const isOrderSettled = order => get( order, 'settled', false );
const isOrderPartFilled = order => toNumber( get( order, 'filled_size', 0 ) ) > 0;

const eventKeys = {
	ORDERS_SETTLED: 'ORDERS_SETTLED',
	ORDERS_CHANGED: 'ORDERS_CHANGED',
};

class TradesController extends Emitter {

	constructor( { GdaxAuthed, pollingInterval = 10000 } ) {
		super();

		this.GdaxAuthed = GdaxAuthed;
		this.orders = [];
		this.orderPoll = null;
		this.ordersFetching = false;
		this.pollingInterval = pollingInterval;

		bindAll( this, [
			'fetchOrders',
			'fetchOrderById',
			'fetchMultipleOrdersByIds',
			'checkOrders',
			'syncOrders',
			'startPollingOrders',
			'maybeEmitSettled',
			'maybeEmitOrderChanges',
		] );

		// ======

		this.on( 'start', this.startPollingOrders );

		// ======

		this.startPollingOrders();
		this.checkOrders();
	}

	startPollingOrders() {
		this.orderPoll = setInterval( this.checkOrders, this.pollingInterval );
	}

	fetchOrders() {
		return new Promise(
			( resolve, reject ) =>
				this.GdaxAuthed.getOrders(
					{
						...this.market && { product_id: this.market }
					},
					( error, response, data ) => error ? reject( error ) : resolve( data )
				)
		)
	}

	fetchOrderById( id ) {
		return new Promise(
			( resolve, reject ) => id
				? this.GdaxAuthed.getOrder(
					id,
					( error, response, data ) => {
						// Unfortunately, once a trade is cancelled it will 404,
						// so the best we can do is look for the statusCode and assume it's cancelled
						const statusCode = get( error, 'response.statusCode' );
						const cancelled = statusCode === 404;

						if ( cancelled ) {
							return resolve( {
								id,
								status: IS_CANCELLED_STATUS,
							} );
						}

						return error ? reject( error ) : resolve( data )
					}
				)
				: reject(  new Error( 'Missing id argument' ) )
		)
	}

	fetchMultipleOrdersByIds( ids ) {
		return Promise.all( map( ids, this.fetchOrderById ) );
	}

	checkOrders() {
		return this.fetchOrders()
			.then( this.syncOrders )
			.then( this.maybeEmitSettled )
			.then( this.maybeEmitOrderChanges )
			.catch( logAll )
	}

	maybeEmitSettled( orderGroups = {} ) {
		! isEmpty( orderGroups.settledOrders ) && (
			this.emit( eventKeys.ORDERS_SETTLED, {
				orders: orderGroups.settledOrders
			} )
		);

		return orderGroups;
	}

	maybeEmitOrderChanges( orderGroups = {} ) {
		const hasChanges = some( omit( orderGroups, 'matchedOrders' ), x => ! isEmpty( x ) );
		hasChanges && (
			this.emit( eventKeys.ORDERS_CHANGED, {
				orderGroups,
			} )
		);

		return orderGroups;
	}

	syncOrders( orders = [] ) {
	 	return new Promise( ( resolve, reject ) => {
			const currentIds = map( this.orders, 'id' );
			const incomingIds = map( orders, 'id' );
			const missingOrderIds = difference( currentIds, incomingIds );
			const newOrders = filter( orders, order => ! includes( currentIds, order.id ) );
			const matchedOrders = filter( orders, order => includes( currentIds, order.id ) );
			// Not super sophisticated, this will only ping once.
			// To be more accurate we'd need to compare filled size.
			const partFilledOrders = filter( newOrders, isOrderPartFilled );

			this.orders = orders;

			// For now I've added a cap of 5 orders to fetch individually.
			// There are one or two errors that should be handled before lifting this cap
			// To avoid repeatedly spamming the API...
			if ( ! isEmpty( missingOrderIds ) && missingOrderIds.length <= 5 ) {
				console.log( `Fetching ${ missingOrderIds.length } individually...` );
				return this.fetchMultipleOrdersByIds( missingOrderIds )
					.then( missingOrders => {
						const cancelledOrders = filter( missingOrders, isOrderCancelled );
						const settledOrders = filter( missingOrders, isOrderSettled );

						resolve( {
							cancelledOrders,
							settledOrders,
							newOrders,
							matchedOrders,
							partFilledOrders
						} );
					} );
			}

			missingOrderIds.length >= 5 && (
				console.log( `Skipped fetching ${ missingOrderIds.length } individual orders` )
			);

			resolve( {
				cancelledOrders: [],
				settledOrders: [],
				newOrders,
				matchedOrders,
				partFilledOrders,
			} );
		} );
	}
}

TradesController.eventKeys = eventKeys;

module.exports = TradesController;
