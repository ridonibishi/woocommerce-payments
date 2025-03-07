/** @format */

/**
 * External dependencies
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import user from '@testing-library/user-event';

/**
 * Internal dependencies
 */
import PaymentMethods from '..';
import {
	useAccountDomesticCurrency,
	useEnabledPaymentMethodIds,
	useGetAvailablePaymentMethodIds,
	useGetPaymentMethodStatuses,
	useManualCapture,
	useSelectedPaymentMethod,
	useUnselectedPaymentMethod,
} from 'wcpay/data';
import WCPaySettingsContext from '../../settings/wcpay-settings-context';
import WcPayUpeContextProvider from '../../settings/wcpay-upe-toggle/provider';
import WcPayUpeContext from '../../settings/wcpay-upe-toggle/context';
import { upeCapabilityStatuses } from 'wcpay/additional-methods-setup/constants';

jest.mock( '@woocommerce/components', () => {
	return {
		Pill: ( { className, children } ) => (
			<span className={ className }>{ children }</span>
		),
	};
} );

jest.mock( '../../data', () => ( {
	useEnabledPaymentMethodIds: jest.fn(),
	useGetAvailablePaymentMethodIds: jest.fn(),
	useCurrencies: jest.fn().mockReturnValue( { isLoading: true } ),
	useEnabledCurrencies: jest.fn().mockReturnValue( {} ),
	useGetPaymentMethodStatuses: jest.fn().mockReturnValue( {} ),
	useManualCapture: jest.fn(),
	useSelectedPaymentMethod: jest.fn(),
	useUnselectedPaymentMethod: jest.fn(),
	useAccountDomesticCurrency: jest.fn(),
} ) );

jest.mock( '@wordpress/data', () => ( {
	useDispatch: jest
		.fn()
		.mockReturnValue( { updateAvailablePaymentMethodIds: jest.fn() } ),
} ) );

describe( 'PaymentMethods', () => {
	beforeEach( () => {
		useEnabledPaymentMethodIds.mockReturnValue( [ [], jest.fn() ] );
		useSelectedPaymentMethod.mockReturnValue( [ null, jest.fn() ] );
		useUnselectedPaymentMethod.mockReturnValue( [ null, jest.fn() ] );
		useGetAvailablePaymentMethodIds.mockReturnValue( [
			'card',
			'au_becs_debit',
			'bancontact',
			'eps',
			'giropay',
			'ideal',
			'p24',
			'sepa_debit',
			'sofort',
		] );
		useGetPaymentMethodStatuses.mockReturnValue( {
			card_payments: upeCapabilityStatuses.ACTIVE,
			au_becs_debit: upeCapabilityStatuses.ACTIVE,
			bancontact_payments: upeCapabilityStatuses.ACTIVE,
			eps_payments: upeCapabilityStatuses.ACTIVE,
			giropay_payments: upeCapabilityStatuses.ACTIVE,
			ideal_payments: upeCapabilityStatuses.ACTIVE,
			p24_payments: upeCapabilityStatuses.ACTIVE,
			sepa_debit_payments: upeCapabilityStatuses.ACTIVE,
			sofort_payments: upeCapabilityStatuses.ACTIVE,
		} );
		useManualCapture.mockReturnValue( [ false, jest.fn() ] );
		global.wcpaySettings = {
			accountEmail: 'admin@example.com',
		};
		useAccountDomesticCurrency.mockReturnValue( 'usd' );
	} );

	test( 'payment methods are rendered correctly', () => {
		useEnabledPaymentMethodIds.mockReturnValue( [
			[ 'card', 'sepa_debit' ],
		] );

		render(
			<WcPayUpeContextProvider defaultIsUpeEnabled={ true }>
				<PaymentMethods />
			</WcPayUpeContextProvider>
		);

		const cc = screen.getByRole( 'checkbox', {
			name: 'Credit / Debit card',
		} );
		const becs = screen.getByRole( 'checkbox', {
			name: 'BECS Direct Debit',
		} );
		const sepa = screen.getByRole( 'checkbox', {
			name: 'SEPA Direct Debit',
		} );
		const bancontact = screen.getByRole( 'checkbox', {
			name: 'Bancontact',
		} );
		const eps = screen.getByRole( 'checkbox', { name: 'EPS' } );
		const giropay = screen.getByRole( 'checkbox', { name: 'giropay' } );
		const sofort = screen.getByRole( 'checkbox', { name: 'Sofort' } );
		const p24 = screen.getByRole( 'checkbox', {
			name: 'Przelewy24 (P24)',
		} );
		const ideal = screen.getByRole( 'checkbox', { name: 'iDEAL' } );

		const allMethods = [
			becs,
			bancontact,
			eps,
			giropay,
			sofort,
			ideal,
			p24,
			cc,
			sepa,
		];
		const enabledMethods = [ cc, sepa ];

		enabledMethods.forEach( ( method ) => {
			expect( method ).toBeChecked();
		} );
		allMethods.forEach( ( method ) => {
			expect( method.closest( 'ul' ) ).toHaveClass(
				'payment-methods__available-methods'
			);
		} );
		allMethods
			.filter( ( method ) => ! enabledMethods.includes( method ) )
			.forEach( ( method ) => {
				expect( method ).not.toBeChecked();
			} );
	} );

	test( 'inactive and pending payment methods have notice pills', () => {
		const updateEnabledMethodsMock = jest.fn( () => {} );
		useSelectedPaymentMethod.mockReturnValue( [
			[
				'Credit / Debit card',
				'BECS Direct Debit',
				'Bancontact',
				'EPS',
				'giropay',
				'iDEAL',
				'Przelewy24 (P24)',
				'SEPA Direct Debit',
				'Sofort',
			],
			updateEnabledMethodsMock,
		] );
		useGetPaymentMethodStatuses.mockReturnValue( {
			card_payments: {
				status: upeCapabilityStatuses.ACTIVE,
				requirements: [],
			},
			au_becs_debit: {
				status: upeCapabilityStatuses.INACTIVE,
				requirements: [],
			},
			bancontact_payments: {
				status: upeCapabilityStatuses.INACTIVE,
				requirements: [],
			},
			eps_payments: {
				status: upeCapabilityStatuses.INACTIVE,
				requirements: [],
			},
			giropay_payments: {
				status: upeCapabilityStatuses.PENDING_APPROVAL,
				requirements: [],
			},
			ideal_payments: {
				status: upeCapabilityStatuses.INACTIVE,
				requirements: [],
			},
			p24_payments: {
				status: upeCapabilityStatuses.INACTIVE,
				requirements: [],
			},
			sepa_debit_payments: {
				status: upeCapabilityStatuses.ACTIVE,
				requirements: [],
			},
			sofort_payments: {
				status: upeCapabilityStatuses.PENDING_VERIFICATION,
				requirements: [ 'individual.identification_number' ],
			},
		} );

		render(
			<WcPayUpeContextProvider defaultIsUpeEnabled={ true }>
				<PaymentMethods />
			</WcPayUpeContextProvider>
		);

		expect( screen.queryAllByText( /Pending /i ).length ).toEqual( 4 );
	} );

	test( 'upe setup banner is rendered when UPE preview feature flag is enabled', () => {
		const featureFlagContext = {
			featureFlags: { upeSettingsPreview: true, upe: false },
		};
		const upeContext = {
			isUpeEnabled: false,
			setIsUpeEnabled: () => null,
			status: 'resolved',
		};

		render(
			<WCPaySettingsContext.Provider value={ featureFlagContext }>
				<WcPayUpeContext.Provider value={ upeContext }>
					<PaymentMethods />
				</WcPayUpeContext.Provider>
			</WCPaySettingsContext.Provider>
		);

		const enableWooCommercePaymentText = screen.getByText(
			'Boost your sales by accepting additional payment methods'
		);

		expect( enableWooCommercePaymentText ).toBeInTheDocument();
	} );

	test( 'affirm afterpay pms renders correctly', () => {
		useGetAvailablePaymentMethodIds.mockReturnValue( [
			'card',
			'au_becs_debit',
			'affirm',
			'afterpay_clearpay',
			'bancontact',
			'eps',
			'giropay',
			'ideal',
			'p24',
			'sepa_debit',
			'sofort',
		] );

		global.wcpaySettings.isBnplAffirmAfterpayEnabled = true;

		render(
			<WcPayUpeContextProvider defaultIsUpeEnabled={ true }>
				<PaymentMethods />
			</WcPayUpeContextProvider>
		);

		const affirm = screen.getByRole( 'checkbox', { name: 'Affirm' } );
		const afterpay = screen.getByRole( 'checkbox', {
			name: 'Afterpay',
		} );

		expect( affirm ).toBeInTheDocument();
		expect( afterpay ).toBeInTheDocument();
	} );

	test( 'affirm and afterpay appear checked when enabled', () => {
		useGetAvailablePaymentMethodIds.mockReturnValue( [
			'card',
			'au_becs_debit',
			'affirm',
			'afterpay_clearpay',
			'bancontact',
			'eps',
			'giropay',
			'ideal',
			'p24',
			'sepa_debit',
			'sofort',
		] );
		useEnabledPaymentMethodIds.mockReturnValue( [
			[ 'card', 'affirm', 'afterpay_clearpay' ],
		] );

		global.wcpaySettings.isBnplAffirmAfterpayEnabled = true;

		useGetPaymentMethodStatuses.mockReturnValue( {
			card_payments: {
				status: upeCapabilityStatuses.ACTIVE,
				requirements: [],
			},
			affirm_payments: {
				status: upeCapabilityStatuses.ACTIVE,
				requirements: [],
			},
			afterpay_clearpay_payments: {
				status: upeCapabilityStatuses.ACTIVE,
				requirements: [],
			},
		} );

		const renderPaymentElements = () => {
			render(
				<WcPayUpeContextProvider defaultIsUpeEnabled={ true }>
					<PaymentMethods />
				</WcPayUpeContextProvider>
			);
		};

		renderPaymentElements();

		const affirm = screen.getByRole( 'checkbox', {
			name: 'Affirm',
		} );
		const afterpay = screen.getByRole( 'checkbox', {
			name: 'Afterpay',
		} );

		expect( affirm ).toBeChecked();
		expect( afterpay ).toBeChecked();
	} );

	test( 'upe setup banner has Buy Now Pay Later methods asset for eligible merchants', () => {
		const featureFlagContext = {
			featureFlags: { upeSettingsPreview: true, upe: false },
		};
		const upeContext = {
			isUpeEnabled: false,
			setIsUpeEnabled: () => null,
			status: 'resolved',
		};

		global.wcpaySettings.isBnplAffirmAfterpayEnabled = true;

		render(
			<WCPaySettingsContext.Provider value={ featureFlagContext }>
				<WcPayUpeContext.Provider value={ upeContext }>
					<PaymentMethods />
				</WcPayUpeContext.Provider>
			</WCPaySettingsContext.Provider>
		);

		const enableWooCommercePaymentText = screen.getByText(
			'Boost your sales by accepting additional payment methods'
		);

		expect( enableWooCommercePaymentText.parentElement ).not.toHaveClass(
			'background-local-payment-methods'
		);
	} );

	test( 'upe setup banner has only local methods in asset for non-BNPL-eligible merchants', () => {
		const featureFlagContext = {
			featureFlags: { upeSettingsPreview: true, upe: false },
		};
		const upeContext = {
			isUpeEnabled: false,
			setIsUpeEnabled: () => null,
			status: 'resolved',
		};

		global.wcpaySettings.isBnplAffirmAfterpayEnabled = false;

		render(
			<WCPaySettingsContext.Provider value={ featureFlagContext }>
				<WcPayUpeContext.Provider value={ upeContext }>
					<PaymentMethods />
				</WcPayUpeContext.Provider>
			</WCPaySettingsContext.Provider>
		);

		const enableWooCommercePaymentText = screen.getByText(
			'Boost your sales by accepting additional payment methods'
		);

		expect( enableWooCommercePaymentText.parentElement ).toHaveClass(
			'background-local-payment-methods'
		);
	} );

	test.each( [
		[ false, false ],
		[ false, true ],
		[ true, true ],
	] )(
		'express payments should not rendered when UPE preview = %s and UPE = %s',
		( upeSettingsPreview, upe ) => {
			const featureFlagContext = {
				featureFlags: { upeSettingsPreview, upe },
			};
			const upeContext = {
				isUpeEnabled: upe,
				setIsUpeEnabled: () => null,
				status: 'resolved',
			};

			render(
				<WCPaySettingsContext.Provider value={ featureFlagContext }>
					<WcPayUpeContext.Provider value={ upeContext }>
						<PaymentMethods />
					</WcPayUpeContext.Provider>
				</WCPaySettingsContext.Provider>
			);

			const enableWooCommercePaymentText = screen.queryByText(
				'Boost your sales by accepting additional payment methods'
			);

			expect( enableWooCommercePaymentText ).toBeNull();
		}
	);

	test( 'renders the feedback elements when UPE is enabled', () => {
		render(
			<WcPayUpeContextProvider defaultIsUpeEnabled={ true }>
				<PaymentMethods />
			</WcPayUpeContextProvider>
		);
		const disableUPEButton = screen.queryByRole( 'button', {
			name: 'Add feedback or disable',
		} );

		expect( disableUPEButton ).toBeInTheDocument();
		expect(
			screen.queryByText( 'Payment methods' ).parentElement
		).toHaveTextContent( 'Payment methods Early access' );
	} );

	test( 'Does not render the feedback elements when UPE is disabled', () => {
		render(
			<WcPayUpeContextProvider defaultIsUpeEnabled={ false }>
				<PaymentMethods />
			</WcPayUpeContextProvider>
		);

		const disableUPEButton = screen.queryByRole( 'button', {
			name: 'Add feedback or disable',
		} );

		expect( disableUPEButton ).not.toBeInTheDocument();
		expect(
			screen.queryByText( 'Payment methods' )
		).not.toBeInTheDocument();
	} );

	test( 'clicking "Enable in your store" in express payments enable UPE and redirects', async () => {
		Object.defineProperty( window, 'location', {
			value: {
				href: 'example.com/',
			},
		} );

		const setIsUpeEnabledMock = jest.fn().mockResolvedValue( true );
		const featureFlagContext = {
			featureFlags: { upeSettingsPreview: true, upe: false },
		};

		render(
			<WCPaySettingsContext.Provider value={ featureFlagContext }>
				<WcPayUpeContext.Provider
					value={ {
						setIsUpeEnabled: setIsUpeEnabledMock,
						status: 'resolved',
						isUpeEnabled: false,
					} }
				>
					<PaymentMethods />
				</WcPayUpeContext.Provider>
			</WCPaySettingsContext.Provider>
		);

		const enableInYourStoreButton = screen.queryByRole( 'button', {
			name: 'Enable in your store',
		} );

		expect( enableInYourStoreButton ).toBeInTheDocument();

		expect( setIsUpeEnabledMock ).not.toHaveBeenCalled();
		await user.click( enableInYourStoreButton );
		expect( setIsUpeEnabledMock ).toHaveBeenCalledWith( true );
		expect( window.location.href ).toEqual(
			'admin.php?page=wc-admin&path=%2Fpayments%2Fadditional-payment-methods'
		);
	} );

	it( 'should render the activation modal when requirements exist for the payment method', () => {
		useEnabledPaymentMethodIds.mockReturnValue( [ [], jest.fn() ] );
		useGetAvailablePaymentMethodIds.mockReturnValue( [ 'bancontact' ] );
		useGetPaymentMethodStatuses.mockReturnValue( {
			bancontact_payments: {
				status: upeCapabilityStatuses.UNREQUESTED,
				requirements: [ 'company.tax_id' ],
			},
		} );

		render(
			<WcPayUpeContextProvider defaultIsUpeEnabled={ true }>
				<PaymentMethods />
			</WcPayUpeContextProvider>
		);

		expect(
			screen.queryByRole( 'checkbox', { name: /Bancontact/ } )
		).toBeInTheDocument();

		const bancontactCheckbox = screen.queryByRole( 'checkbox', {
			name: /Bancontact/,
		} );

		expect( bancontactCheckbox ).not.toBeChecked();

		jest.useFakeTimers();

		act( () => {
			// Enabling a PM with requirements should show the activation modal
			user.click( bancontactCheckbox );
			jest.runOnlyPendingTimers();
		} );

		expect(
			screen.queryByText(
				/You need to provide more information to enable Bancontact on your checkout/
			)
		).toBeInTheDocument();

		jest.useRealTimers();
	} );

	it( 'should render the delete modal on an already active payment method', () => {
		useEnabledPaymentMethodIds.mockReturnValue( [
			[ 'bancontact' ],
			jest.fn(),
		] );
		useGetAvailablePaymentMethodIds.mockReturnValue( [ 'bancontact' ] );
		useGetPaymentMethodStatuses.mockReturnValue( {
			bancontact_payments: {
				status: upeCapabilityStatuses.ACTIVE,
				requirements: [],
			},
		} );

		render(
			<WcPayUpeContextProvider defaultIsUpeEnabled={ true }>
				<PaymentMethods />
			</WcPayUpeContextProvider>
		);

		expect( screen.queryByLabelText( 'Bancontact' ) ).toBeInTheDocument();

		const bancontactCheckbox = screen.getByLabelText( 'Bancontact' );

		expect( bancontactCheckbox ).toBeChecked();

		jest.useFakeTimers();

		act( () => {
			// Disabling an already active PM should show the delete modal
			user.click( bancontactCheckbox );
			jest.runOnlyPendingTimers();
		} );

		expect(
			screen.queryByText(
				/Your customers will no longer be able to pay using Bancontact\./
			)
		).toBeInTheDocument();

		jest.useRealTimers();
	} );
} );
