/* global jQuery */

/**
 * External dependencies
 */
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import './style.scss';
import {
	PAYMENT_METHOD_NAME_CARD,
	PAYMENT_METHOD_NAME_UPE,
	SHORTCODE_SHIPPING_ADDRESS_FIELDS,
	SHORTCODE_BILLING_ADDRESS_FIELDS,
} from '../constants';
import { getConfig, getCustomGatewayTitle } from 'utils/checkout';
import WCPayAPI from '../api';
import enqueueFraudScripts from 'fraud-scripts';
import { getFontRulesFromPage, getAppearance } from '../upe-styles';
import {
	getTerms,
	getCookieValue,
	isWCPayChosen,
	isLinkEnabled,
	getBillingDetails,
	getShippingDetails,
} from '../utils/upe';
import { decryptClientSecret } from '../utils/encryption';
import enableStripeLinkPaymentMethod from '../stripe-link';
import apiRequest from '../utils/request';
import showErrorCheckout from '../utils/show-error-checkout';
import {
	getFingerprint,
	appendFingerprintInputToForm,
} from '../utils/fingerprint';
import PAYMENT_METHOD_IDS from 'wcpay/payment-methods/constants';

jQuery( function ( $ ) {
	enqueueFraudScripts( getConfig( 'fraudServices' ) );

	const publishableKey = getConfig( 'publishableKey' );
	const isChangingPayment = getConfig( 'isChangingPayment' );
	const isUPEEnabled = getConfig( 'isUPEEnabled' );
	const paymentMethodsConfig = getConfig( 'paymentMethodsConfig' );
	const enabledBillingFields = getConfig( 'enabledBillingFields' );
	const upePaymentIntentData = getConfig( 'upePaymentIntentData' );
	const upeSetupIntentData = getConfig( 'upeSetupIntentData' );
	const isStripeLinkEnabled = isLinkEnabled( paymentMethodsConfig );

	if ( ! publishableKey ) {
		// If no configuration is present, probably this is not the checkout page.
		return;
	}

	// Create an API object, which will be used throughout the checkout.
	const api = new WCPayAPI(
		{
			publishableKey,
			accountId: getConfig( 'accountId' ),
			forceNetworkSavedCards: getConfig( 'forceNetworkSavedCards' ),
			locale: getConfig( 'locale' ),
			isUPEEnabled,
			isStripeLinkEnabled,
		},
		apiRequest
	);

	let elements = null;
	let upeElement = null;
	let paymentIntentId = null;
	let paymentIntentClientSecret = null;
	let isUPEComplete = false;
	let fingerprint = null;

	const hiddenBillingFields = {
		name:
			enabledBillingFields.includes( 'billing_first_name' ) ||
			enabledBillingFields.includes( 'billing_last_name' )
				? 'never'
				: 'auto',
		email: enabledBillingFields.includes( 'billing_email' )
			? 'never'
			: 'auto',
		phone: enabledBillingFields.includes( 'billing_phone' )
			? 'never'
			: 'auto',
		address: {
			country: enabledBillingFields.includes( 'billing_country' )
				? 'never'
				: 'auto',
			line1: enabledBillingFields.includes( 'billing_address_1' )
				? 'never'
				: 'auto',
			line2: enabledBillingFields.includes( 'billing_address_2' )
				? 'never'
				: 'auto',
			city: enabledBillingFields.includes( 'billing_city' )
				? 'never'
				: 'auto',
			state: enabledBillingFields.includes( 'billing_state' )
				? 'never'
				: 'auto',
			postalCode: enabledBillingFields.includes( 'billing_postcode' )
				? 'never'
				: 'auto',
		},
	};

	/**
	 * Block UI to indicate processing and avoid duplicate submission.
	 *
	 * @param {Object} $form The jQuery object for the form.
	 */
	const blockUI = ( $form ) => {
		$form.addClass( 'processing' ).block( {
			message: null,
			overlayCSS: {
				background: '#fff',
				opacity: 0.6,
			},
		} );
	};

	/**
	 * Unblock UI to remove overlay and loading icon
	 *
	 * @param {Object} $form The jQuery object for the form.
	 */
	const unblockUI = ( $form ) => {
		$form.removeClass( 'processing' ).unblock();
	};

	// Show or hide save payment information checkbox
	const showNewPaymentMethodCheckbox = ( show = true ) => {
		if ( show ) {
			$( '.woocommerce-SavedPaymentMethods-saveNew' ).show();
		} else {
			$( '.woocommerce-SavedPaymentMethods-saveNew' ).hide();
			$( 'input#wc-woocommerce_payments-new-payment-method' ).prop(
				'checked',
				false
			);
			$( 'input#wc-woocommerce_payments-new-payment-method' ).trigger(
				'change'
			);
		}
	};

	// Set the selected UPE payment type field
	const setSelectedUPEPaymentType = ( paymentType ) => {
		$( '#wcpay_selected_upe_payment_type' ).val( paymentType );
	};

	// Get the selected UPE payment type field
	const getSelectedUPEPaymentType = () => {
		return $( '#wcpay_selected_upe_payment_type' ).val();
	};

	// Set the payment country field
	const setPaymentCountry = ( country ) => {
		$( '#wcpay_payment_country' ).val( country );
	};

	/**
	 * Mounts Stripe UPE element if feature is enabled.
	 *
	 * @param {boolean} isSetupIntent {Boolean} isSetupIntent Set to true if we are on My Account adding a payment method.
	 */
	const mountUPEElement = async function ( isSetupIntent = false ) {
		// Do not mount UPE twice.
		if ( upeElement || paymentIntentId ) {
			return;
		}

		if ( ! fingerprint ) {
			try {
				const { visitorId } = await getFingerprint();
				fingerprint = visitorId;
			} catch ( error ) {
				// Do not mount element if fingerprinting is not available
				showErrorCheckout( error.message );

				return;
			}
		}

		/*
		 * Trigger this event to ensure the tokenization-form.js init
		 * is executed.
		 *
		 * This script handles the radio input interaction when toggling
		 * between the user's saved card / entering new card details.
		 *
		 * Ref: https://github.com/woocommerce/woocommerce/blob/2429498/assets/js/frontend/tokenization-form.js#L109
		 */
		$( document.body ).trigger( 'wc-credit-card-form-init' );

		// If paying from order, we need to create Payment Intent from order not cart.
		const isOrderPay = getConfig( 'isOrderPay' );
		const isCheckout = getConfig( 'isCheckout' );
		let orderId;
		if ( isOrderPay ) {
			orderId = getConfig( 'orderId' );
		}

		let { intentId, clientSecret } = isSetupIntent
			? getSetupIntentFromSession()
			: getPaymentIntentFromSession();

		const $upeContainer = $( '#wcpay-upe-element' );
		blockUI( $upeContainer );

		if ( ! intentId ) {
			try {
				const newIntent = isSetupIntent
					? await api.initSetupIntent()
					: await api.createIntent( { fingerprint, orderId } );
				intentId = newIntent.id;
				clientSecret = newIntent.client_secret;
			} catch ( error ) {
				unblockUI( $upeContainer );
				showErrorCheckout( error.message );
				const gatewayErrorMessage = __(
					'An error was encountered when preparing the payment form. Please try again later.',
					'woocommerce-payments'
				);
				$( '.payment_box.payment_method_woocommerce_payments' ).html(
					`<div>${ gatewayErrorMessage }</div>`
				);
			}
		}

		// I repeat, do NOT mount UPE twice.
		if ( upeElement || paymentIntentId ) {
			unblockUI( $upeContainer );
			return;
		}

		paymentIntentId = intentId;
		paymentIntentClientSecret = clientSecret;

		let appearance = getConfig( 'upeAppearance' );

		if ( ! appearance ) {
			appearance = getAppearance();
			api.saveUPEAppearance( appearance );
		}

		elements = api.getStripe().elements( {
			clientSecret: decryptClientSecret( clientSecret ),
			appearance,
			fonts: getFontRulesFromPage(),
			loader: 'never',
		} );

		if ( isStripeLinkEnabled ) {
			enableStripeLinkPaymentMethod( {
				api: api,
				elements: elements,
				emailId: 'billing_email',
				complete_billing: () => {
					return true;
				},
				complete_shipping: () => {
					return (
						document.getElementById(
							'ship-to-different-address-checkbox'
						) &&
						document.getElementById(
							'ship-to-different-address-checkbox'
						).checked
					);
				},
				shipping_fields: SHORTCODE_SHIPPING_ADDRESS_FIELDS,
				billing_fields: SHORTCODE_BILLING_ADDRESS_FIELDS,
			} );
		}

		const upeSettings = {};
		if ( getConfig( 'cartContainsSubscription' ) ) {
			upeSettings.terms = getTerms( paymentMethodsConfig, 'always' );
		}
		if ( isCheckout && ! ( isOrderPay || isChangingPayment ) ) {
			upeSettings.fields = {
				billingDetails: hiddenBillingFields,
			};
		}

		upeElement = elements.create( 'payment', {
			...upeSettings,
			wallets: {
				applePay: 'never',
				googlePay: 'never',
			},
		} );
		upeElement.mount( '#wcpay-upe-element' );
		unblockUI( $upeContainer );
		upeElement.on( 'change', ( event ) => {
			const selectedUPEPaymentType = event.value.type;
			const isPaymentMethodReusable =
				paymentMethodsConfig[ selectedUPEPaymentType ].isReusable;
			showNewPaymentMethodCheckbox( isPaymentMethodReusable );
			setSelectedUPEPaymentType( selectedUPEPaymentType );
			setPaymentCountry( event.value.country );
			isUPEComplete = event.complete;
		} );
	};

	const renameGatewayTitle = () =>
		$( 'label[for=payment_method_woocommerce_payments]' ).text(
			getCustomGatewayTitle( paymentMethodsConfig )
		);

	// Only attempt to mount the card element once that section of the page has loaded. We can use the updated_checkout
	// event for this. This part of the page can also reload based on changes to checkout details, so we call unmount
	// first to ensure the card element is re-mounted correctly.
	$( document.body ).on( 'updated_checkout', () => {
		// If the card element selector doesn't exist, then do nothing (for example, when a 100% discount coupon is applied).
		// We also don't re-mount if already mounted in DOM.
		if (
			$( '#wcpay-upe-element' ).length &&
			! $( '#wcpay-upe-element' ).children().length &&
			isUPEEnabled
		) {
			if ( upeElement ) {
				upeElement.mount( '#wcpay-upe-element' );
			} else {
				mountUPEElement();
			}
			renameGatewayTitle();
		}
	} );

	if (
		$( 'form#add_payment_method' ).length ||
		$( 'form#order_review' ).length
	) {
		if (
			$( '#wcpay-upe-element' ).length &&
			! $( '#wcpay-upe-element' ).children().length &&
			isUPEEnabled &&
			! upeElement
		) {
			renameGatewayTitle();

			// We use a setup intent if we are on the screens to add a new payment method or to change a subscription payment.
			const useSetUpIntent =
				$( 'form#add_payment_method' ).length || isChangingPayment;

			if ( isChangingPayment && getConfig( 'newTokenFormId' ) ) {
				// Changing the method for a subscription takes two steps:
				// 1. Create the new payment method that will redirect back.
				// 2. Select the new payment method and resubmit the form to update the subscription.
				const token = getConfig( 'newTokenFormId' );
				$( token ).prop( 'selected', true ).trigger( 'click' );
				$( 'form#order_review' ).submit();
			}
			mountUPEElement( useSetUpIntent );
		}
	}

	/**
	 * Checks if UPE form is filled out. Displays errors if not.
	 *
	 * @param {Object} $form     The jQuery object for the form.
	 * @param {string} returnUrl The `return_url` param. Defaults to '#' (optional)
	 * @return {boolean} false if incomplete.
	 */
	const checkUPEForm = async ( $form, returnUrl = '#' ) => {
		if ( ! upeElement ) {
			showErrorCheckout(
				__(
					'Your payment information is incomplete.',
					'woocommerce-payments'
				)
			);
			return false;
		}
		if ( ! isUPEComplete ) {
			// If UPE fields are not filled, confirm payment to trigger validation errors
			const { error } = await api.handlePaymentConfirmation(
				elements,
				{
					return_url: returnUrl,
				},
				null
			);
			$form.removeClass( 'processing' ).unblock();
			showErrorCheckout( error.message );
			return false;
		}
		return true;
	};
	/**
	 * Submits the confirmation of the intent to Stripe on Pay for Order page.
	 * Stripe redirects to Order Thank you page on sucess.
	 *
	 * @param {Object} $form The jQuery object for the form.
	 * @return {boolean} A flag for the event handler.
	 */
	const handleUPEOrderPay = async ( $form ) => {
		const isSavingPaymentMethod = $(
			'#wc-woocommerce_payments-new-payment-method'
		).is( ':checked' );
		const savePaymentMethod = isSavingPaymentMethod ? 'yes' : 'no';

		const returnUrl =
			getConfig( 'orderReturnURL' ) +
			`&save_payment_method=${ savePaymentMethod }`;

		const orderId = getConfig( 'orderId' );

		const isUPEFormValid = await checkUPEForm(
			$( '#order_review' ),
			returnUrl
		);
		if ( ! isUPEFormValid ) {
			return;
		}
		blockUI( $form );

		try {
			// Update payment intent with level3 data, customer and maybe setup for future use.
			const updateResponse = await api.updateIntent(
				paymentIntentId,
				orderId,
				savePaymentMethod,
				getSelectedUPEPaymentType(),
				$( '#wcpay_payment_country' ).val()
			);

			if ( updateResponse.data ) {
				if ( updateResponse.data.error ) {
					throw updateResponse.data.error;
				}

				if ( api.handleDuplicatePayments( updateResponse.data ) ) {
					return;
				}
			}

			const { error } = await api.handlePaymentConfirmation(
				elements,
				{
					return_url: returnUrl,
				},
				getPaymentIntentSecret()
			);
			if ( error ) {
				throw error;
			}
		} catch ( error ) {
			$form.removeClass( 'processing' ).unblock();
			showErrorCheckout( error.message );
		}
	};

	/**
	 * Submits the confirmation of the setup intent to Stripe on Add Payment Method page.
	 * Stripe redirects to Payment Methods page on sucess.
	 *
	 * @param {Object} $form The jQuery object for the form.
	 * @return {boolean} A flag for the event handler.
	 */
	const handleUPEAddPayment = async ( $form ) => {
		const returnUrl = getConfig( 'addPaymentReturnURL' );
		const isUPEFormValid = await checkUPEForm( $form, returnUrl );

		if ( ! isUPEFormValid ) {
			return;
		}

		blockUI( $form );

		try {
			const { error } = await api.getStripe().confirmSetup( {
				elements,
				confirmParams: {
					return_url: returnUrl,
				},
			} );
			if ( error ) {
				throw error;
			}
		} catch ( error ) {
			$form.removeClass( 'processing' ).unblock();
			showErrorCheckout( error.message );
		}
	};

	/**
	 * Submits checkout form via AJAX to create order and uses custom
	 * redirect URL in AJAX response to request payment confirmation from UPE
	 *
	 * @param {Object} $form The jQuery object for the form.
	 * @return {boolean} A flag for the event handler.
	 */
	const handleUPECheckout = async ( $form ) => {
		const isUPEFormValid = await checkUPEForm( $form );
		if ( ! isUPEFormValid ) {
			return;
		}

		blockUI( $form );
		// Create object where keys are form field names and keys are form field values
		const formFields = $form.serializeArray().reduce( ( obj, field ) => {
			obj[ field.name ] = field.value;
			return obj;
		}, {} );
		try {
			const response = await api.processCheckout(
				paymentIntentId,
				formFields,
				fingerprint ? fingerprint : ''
			);

			if ( api.handleDuplicatePayments( response ) ) {
				return;
			}

			const redirectUrl = response.redirect_url;
			const upeConfig = {
				elements,
				confirmParams: {
					return_url: redirectUrl,
					payment_method_data: {
						billing_details: getBillingDetails( formFields ),
					},
				},
			};
			const paymentMethodType = getSelectedUPEPaymentType();
			// Afterpay requires shipping details to be passed. Not needed by other payment methods.
			if ( PAYMENT_METHOD_IDS.AFTERPAY_CLEARPAY === paymentMethodType ) {
				upeConfig.confirmParams.shipping = getShippingDetails(
					formFields
				);
			}
			let error;
			if ( response.payment_needed ) {
				( { error } = await api.handlePaymentConfirmation(
					elements,
					upeConfig.confirmParams,
					getPaymentIntentSecret()
				) );
			} else {
				( { error } = await api.getStripe().confirmSetup( upeConfig ) );
			}
			if ( error ) {
				// Log payment errors on charge and then throw the error.
				const logError = await api.logPaymentError( error.charge );
				if ( logError ) {
					throw error;
				}
			}
		} catch ( error ) {
			$form.removeClass( 'processing' ).unblock();
			showErrorCheckout( error.message );
		}
	};

	/**
	 * Displays the authentication modal to the user if needed.
	 */
	const maybeShowAuthenticationModal = () => {
		const paymentMethodId = $( '#wcpay-payment-method' ).val();

		const savePaymentMethod = $(
			'#wc-woocommerce_payments-new-payment-method'
		).is( ':checked' );
		const confirmation = api.confirmIntent(
			window.location.href,
			savePaymentMethod ? paymentMethodId : null
		);

		// Boolean `true` means that there is nothing to confirm.
		if ( confirmation === true ) {
			return;
		}

		const { request, isOrderPage } = confirmation;

		if ( isOrderPage ) {
			blockUI( $( '#order_review' ) );
			$( '#payment' ).hide( 500 );
		}

		// Cleanup the URL.
		// https://stackoverflow.com/a/5298684
		history.replaceState(
			'',
			document.title,
			window.location.pathname + window.location.search
		);

		request
			.then( ( redirectUrl ) => {
				window.location = redirectUrl;
			} )
			.catch( ( error ) => {
				$( 'form.checkout' ).removeClass( 'processing' ).unblock();
				$( '#order_review' ).removeClass( 'processing' ).unblock();
				$( '#payment' ).show( 500 );

				let errorMessage = error.message;

				// If this is a generic error, we probably don't want to display the error message to the user,
				// so display a generic message instead.
				if ( error instanceof Error ) {
					errorMessage = getConfig( 'genericErrorMessage' );
				}

				showErrorCheckout( errorMessage );
			} );
	};

	/**
	 * Returns the cached payment intent for the current cart state.
	 *
	 * @return {Object} The intent id and client secret required for mounting the UPE element.
	 */
	function getPaymentIntentFromSession() {
		const cartHash = getCookieValue( 'woocommerce_cart_hash' );

		if (
			cartHash &&
			upePaymentIntentData &&
			upePaymentIntentData.startsWith( cartHash )
		) {
			const intentId = upePaymentIntentData.split( '-' )[ 1 ];
			const clientSecret = upePaymentIntentData.split( '-' )[ 2 ];
			return { intentId, clientSecret };
		}

		return {};
	}

	/**
	 * Returns the cached setup intent.
	 *
	 * @return {Object} The intent id and client secret required for mounting the UPE element.
	 */
	function getSetupIntentFromSession() {
		if ( upeSetupIntentData ) {
			const intentId = upeSetupIntentData.split( '-' )[ 0 ];
			const clientSecret = upeSetupIntentData.split( '-' )[ 1 ];
			return { intentId, clientSecret };
		}

		return {};
	}

	/**
	 * Returns stripe intent secret that will be used to confirm payment
	 *
	 * @return {string | null} The intent secret required to confirm payment during the rate limit error.
	 */
	function getPaymentIntentSecret() {
		if ( paymentIntentClientSecret ) {
			return paymentIntentClientSecret;
		}
		const { clientSecret } = getPaymentIntentFromSession();
		return clientSecret ? clientSecret : null;
	}

	// Handle the checkout form when WooPayments is chosen.
	const wcpayPaymentMethods = [
		PAYMENT_METHOD_NAME_CARD,
		PAYMENT_METHOD_NAME_UPE,
	];
	const checkoutEvents = wcpayPaymentMethods
		.map( ( method ) => `checkout_place_order_${ method }` )
		.join( ' ' );
	$( 'form.checkout' ).on( checkoutEvents, function () {
		if ( ! isUsingSavedPaymentMethod() ) {
			if ( isUPEEnabled && paymentIntentId ) {
				handleUPECheckout( $( this ) );
				return false;
			}
		}

		appendFingerprintInputToForm( $( this ), fingerprint );
	} );

	// Handle the add payment method form for WooPayments.
	$( 'form#add_payment_method' ).on( 'submit', function () {
		if (
			$(
				"#add_payment_method input:checked[name='payment_method']"
			).val() !== 'woocommerce_payments'
		) {
			return;
		}

		if ( ! $( '#wcpay-setup-intent' ).val() ) {
			if ( isUPEEnabled && paymentIntentId ) {
				handleUPEAddPayment( $( this ) );
				return false;
			}
		}
	} );

	// Handle the Pay for Order form if WooPayments is chosen.
	$( '#order_review' ).on( 'submit', () => {
		if ( ! isUsingSavedPaymentMethod() && isWCPayChosen() ) {
			if ( isChangingPayment ) {
				handleUPEAddPayment( $( '#order_review' ) );
				return false;
			}
			handleUPEOrderPay( $( '#order_review' ) );
			return false;
		}
	} );

	// Add terms parameter to UPE if save payment information checkbox is checked.
	$( document ).on(
		'change',
		'#wc-woocommerce_payments-new-payment-method',
		() => {
			const value = $( '#wc-woocommerce_payments-new-payment-method' ).is(
				':checked'
			)
				? 'always'
				: 'never';
			if ( isUPEEnabled && upeElement ) {
				upeElement.update( {
					terms: getTerms( paymentMethodsConfig, value ),
				} );
			}
		}
	);

	// On every page load, check to see whether we should display the authentication
	// modal and display it if it should be displayed.
	maybeShowAuthenticationModal();

	// Handle hash change - used when authenticating payment with SCA on checkout page.
	window.addEventListener( 'hashchange', () => {
		if ( window.location.hash.startsWith( '#wcpay-confirm-' ) ) {
			maybeShowAuthenticationModal();
		}
	} );
} );

/**
 * Checks if the customer is using a saved payment method.
 *
 * @return {boolean} Boolean indicating whether or not a saved payment method is being used.
 */
export function isUsingSavedPaymentMethod() {
	return (
		document.querySelector(
			'#wc-woocommerce_payments-payment-token-new'
		) !== null &&
		! document.querySelector( '#wc-woocommerce_payments-payment-token-new' )
			.checked
	);
}
