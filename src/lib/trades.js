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
	ceil,
	floor,
	inRange,
} = require( 'lodash' );

const { MARKET_DETAILS } = require( '../constants/markets' );

const logAll = console.log.bind( console );
const IS_CANCELLED_STATUS = 'isCancelled';
const BUY_SIDE = 'buy';
const SELL_SIDE = 'sell';
const REJECTED_STATUS = 'rejected';

const getMarketParam = ( market, param, defaultValue ) => get( MARKET_DETAILS, [ market, param ], defaultValue );
const getPriceDecimalsForMarket = market => getMarketParam( market, 'DECIMAL_PRICE', 2 );
const getSizeDecimalsForMarket = market => getMarketParam( market, 'DECIMAL_SIZE', 2 );

const isOrderCancelled = order => get( order, 'status' ) === IS_CANCELLED_STATUS;
const isOrderSettled = order => get( order, 'settled', false );
const isOrderPartFilled = order => toNumber( get( order, 'filled_size', 0 ) ) > 0;
const isOrderBuySide = order => get( order, 'side' ) === BUY_SIDE;
const isOrderSellSide = order => get( order, 'side' ) === SELL_SIDE;

const isValidOrder = ( { product_id: market, price, size } ) => {
	const minSize = getMarketParam( market, 'MINIMUM_SIZE' );
	const maxSize = getMarketParam( market, 'MAXIMUM_SIZE' );
	const sizeIsValid = (
		inRange( size, minSize, maxSize ) &&
		size === floor( size, getSizeDecimalsForMarket( market ) )
	);
	const priceIsValid = price === floor( price, getPriceDecimalsForMarket( market ) );

	return priceIsValid && sizeIsValid;
}

const eventKeys = {
	ORDERS_SETTLED: 'ORDERS_SETTLED',
	ORDERS_CHANGED: 'ORDERS_CHANGED',
};

class TradesController extends Emitter {

	constructor( {
		GdaxAuthed,
		pollingInterval = 10000,
		riseMultiplier = 1.01,
		dropMultiplier = 0.98,
	} ) {
		super();

		this.GdaxAuthed = GdaxAuthed;
		this.orders = [];
		this.orderPoll = null;
		this.ordersFetching = false;
		this.pollingInterval = pollingInterval;
		this.riseMultiplier = riseMultiplier;
		this.dropMultiplier = dropMultiplier;

		bindAll( this, [
			'fetchOrders',
			'fetchOrderById',
			'fetchMultipleOrdersByIds',
			'checkOrders',
			'groupOrders',
			'startPollingOrders',
			'maybeEmitSettled',
			'maybeEmitOrderChanges',
			'maybeSyncMissingOrders',
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
			.then( this.groupOrders )
			.then( this.maybeSyncMissingOrders )
			.then( this.maybeEmitSettled )
			.then( this.maybeEmitOrderChanges )
			.catch( logAll );
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

	maybeSyncMissingOrders( orderGroups ) {
		const { missingOrders } = orderGroups;

		if ( isEmpty( missingOrders ) ) {
			return orderGroups;
		}

		const missingOrderIds = map( missingOrders, 'id' );

		// For now I've added a cap of 10 orders to fetch individually.
		// There are one or two errors that should be handled before lifting this cap
		// To avoid repeatedly spamming the API...
		if ( missingOrders.length >= 10 ) {
			console.log( `Skipping fetching ${ missingOrderIds.length } individually.` );
			return omit( orderGroups, 'missingOrders' );
		}

		console.log( `Fetching ${ missingOrderIds.length } individually...` );

		return this.fetchMultipleOrdersByIds( missingOrderIds )
			.then(
				missingOrders => ( {
					...orderGroups,
					cancelledOrders: filter( missingOrders, isOrderCancelled ),
					settledOrders: filter( missingOrders, isOrderSettled ),
				} )
			);
	}

	groupOrders( orders = [] ) {
		const currentIds = map( this.orders, 'id' );
		const incomingIds = map( orders, 'id' );
		const missingOrderIds = difference( currentIds, incomingIds );
		const newOrders = filter( orders, order => ! includes( currentIds, order.id ) );
		const matchedOrders = filter( orders, order => includes( currentIds, order.id ) );
		const missingOrders = filter( this.orders, order => ! includes( incomingIds, order.id ) );
		// Not super sophisticated, this will only ping once.
		// To be more accurate we'd need to compare filled size.
		// TODO: this will only see part-fills on new orders... fix that.
		const partFilledOrders = filter( newOrders, isOrderPartFilled );

		// TODO: This isn't the place for saving the orders
		this.orders = orders;

		return {
			// Maybe pass the orders along like so?
			// existingOrders: this.orders,
			// incomingOrders: orders,
			missingOrders,
			newOrders,
			matchedOrders,
			partFilledOrders,
		};
	}

	flipOrder( order ) {
		const {
			price: settledPrice,
			side: settledSide,
			filled_size: settledSize,
			product_id: market,
		} = order;

		if ( ! settledSide || ! settledSize || ! market  ) {
			return;
		}

		const settledPriceFloat = toNumber( settledPrice );
		const settledSizeFloat = toNumber( settledSize );

		if ( isOrderBuySide( order ) ) {
			const targetPrice = ceil( settledPriceFloat * dropMultiplier, getPriceDecimalsForMarket( market ) );
			const orderParams = {
				product_id: market,
				price: targetPrice,
				size: settledSizeFloat,
				post_only: true,
			};

			return isValidOrder( orderParams ) && this.sell( orderParams );
		}

		if ( isOrderSellSide( order ) ) {
			const newPrice = ceil( settledPriceFloat * this.dropMultiplier, getPriceDecimalsForMarket( market ) );
			const newSize = floor( ( settledPriceFloat / newPrice ) * settledSizeFloat, getSizeDecimalsForMarket( market ) );
			const orderParams = {
				product_id: market,
				price: newPrice,
				size: newSize,
				post_only: true,
			};

			return isValidOrder( orderParams ) && this.buy( orderParams );
		}
	}

	sell( params ) {
	    return new Promise( ( resolve, reject ) => {
			this.GdaxAuthed.sell( params, ( error, response, data ) => {
				if ( error ) {
					reject( error );
				} else if ( data.status === REJECTED_STATUS ) {
					reject( new Error( 'Sell order rejected at price:', price ) );
				} else {
					resolve( data );
				}
			} );
		} );
	}

	buy( params ) {
	    return new Promise(
	    	( resolve, reject ) => {
			this.GdaxAuthed.buy( params, ( error, response, data ) => {
				if ( error ) {
					reject( error );
				} else if ( data.status === REJECTED_STATUS ) {
					reject( new Error( 'Buy order rejected at price:', price ) );
				} else {
					resolve( data );
				}
		    } );
	    } );
	}
}

TradesController.eventKeys = eventKeys;

module.exports = TradesController;
