/** @format */
/**
 * External dependencies
 */
import { __, sprintf } from '@wordpress/i18n';
import { dateI18n } from '@wordpress/date';
import moment from 'moment';
import { createInterpolateElement } from '@wordpress/element';

/**
 * Internal dependencies
 */
import DepositsStatus from 'components/deposits-status';
import PaymentsStatus from 'components/payments-status';
import StatusChip from 'components/account-status/status-chip';
import './style.scss';

const renderPaymentsStatus = ( paymentsEnabled ) => {
	return (
		<span className="account-status__info">
			{ __( 'Payments:', 'woocommerce-payments' ) }
			<PaymentsStatus
				paymentsEnabled={ paymentsEnabled }
				iconSize={ 18 }
			/>
		</span>
	);
};

const renderDepositsStatus = ( { deposits } ) => {
	return (
		<span className="account-status__info">
			{ __( 'Deposits:', 'woocommerce-payments' ) }
			<DepositsStatus
				iconSize={ 18 }
				status={ deposits?.status }
				interval={ deposits?.interval }
			/>
		</span>
	);
};

const renderAccountStatusDescription = ( accountStatus ) => {
	const { status, currentDeadline, pastDue, accountLink } = accountStatus;
	if ( status === 'complete' ) {
		return '';
	}

	let description = '';
	if ( status === 'restricted_soon' ) {
		description = createInterpolateElement(
			sprintf(
				/* translators: %s - formatted requirements current deadline, <a> - dashboard login URL */
				__(
					'To avoid disrupting deposits, <a>update this account</a> by %s with more information about the business.',
					'woocommerce-payments'
				),
				dateI18n(
					'ga M j, Y',
					moment( currentDeadline * 1000 ).toISOString()
				)
			),
			// eslint-disable-next-line jsx-a11y/anchor-has-content
			{ a: <a href={ accountLink } /> }
		);
	} else if ( status === 'restricted' && pastDue ) {
		description = createInterpolateElement(
			/* translators: <a> - dashboard login URL */
			__(
				'Payments and deposits are disabled for this account until missing business information is updated. <a>Update now</a>',
				'woocommerce-payments'
			),
			// eslint-disable-next-line jsx-a11y/anchor-has-content
			{ a: <a href={ accountLink } /> }
		);
	} else if ( status === 'restricted_partially' ) {
		description = __(
			'Some payment methods and deposits are disabled for this account until all required documents are provided.',
			'woocommerce-payments'
		);
	} else if ( status === 'enabled' ) {
		description = __(
			// eslint-disable-next-line max-len
			'This account is in good standing. Additional business information might be required when a payment volume threshold is reached.',
			'woocommerce-payments'
		);
	} else if ( status === 'restricted' ) {
		description = __(
			'Payments and deposits are disabled for this account until business information is verified by the payment processor.',
			'woocommerce-payments'
		);
	} else if ( status === 'rejected.fraud' ) {
		description = __(
			'This account has been rejected because of suspected fraudulent activity.',
			'woocommerce-payments'
		);
	} else if ( status === 'rejected.terms_of_service' ) {
		description = __(
			'This account has been rejected due to a Terms of Service violation.',
			'woocommerce-payments'
		);
	} else if ( status.startsWith( 'rejected' ) ) {
		description = __(
			'This account has been rejected.',
			'woocommerce-payments'
		);
	}

	if ( ! description ) {
		return null;
	}

	return <div className="account-status__desc">{ description }</div>;
};

const AccountStatus = ( props ) => {
	const { accountStatus } = props;
	if ( accountStatus.error ) {
		return (
			<div>
				{ __(
					'Error determining the connection status.',
					'woocommerce-payments'
				) }
			</div>
		);
	}

	return (
		<div>
			<div>
				<StatusChip
					accountStatus={ accountStatus.status }
					poEnabled={ accountStatus.progressiveOnboarding.isEnabled }
					poComplete={
						accountStatus.progressiveOnboarding.isComplete
					}
				/>
				{ renderPaymentsStatus( accountStatus.paymentsEnabled ) }
				{ renderDepositsStatus( { deposits: accountStatus.deposits } ) }
			</div>
			{ renderAccountStatusDescription( accountStatus ) }
		</div>
	);
};

export default AccountStatus;
