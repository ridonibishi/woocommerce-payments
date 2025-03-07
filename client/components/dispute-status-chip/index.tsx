/** @format **/

/**
 * External dependencies
 */
import React from 'react';

/**
 * Internal dependencies
 */
import Chip from '../chip';
import displayStatus from './mappings';
import { formatStringValue } from 'utils';
import { isAwaitingResponse, isDueWithin } from 'wcpay/disputes/utils';
import type {
	CachedDispute,
	DisputeStatus,
	EvidenceDetails,
} from 'wcpay/types/disputes';

interface Props {
	status: DisputeStatus | string;
	dueBy?: CachedDispute[ 'due_by' ] | EvidenceDetails[ 'due_by' ];
}
const DisputeStatusChip: React.FC< Props > = ( { status, dueBy } ) => {
	const mapping = displayStatus[ status ] || {};
	const message = mapping.message || formatStringValue( status );

	const needsResponse = isAwaitingResponse( status );
	const isUrgent =
		needsResponse && dueBy && isDueWithin( { dueBy, days: 3 } );

	let type = mapping.type || 'light';
	if ( isUrgent ) {
		type = 'alert';
	}

	return <Chip message={ message } type={ type } />;
};

export default DisputeStatusChip;
