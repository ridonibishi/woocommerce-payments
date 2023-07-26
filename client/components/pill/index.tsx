/**
 * External dependencies
 */
import React, { FC, ReactNode } from 'react';
import { Pill as WC_Pill } from '@woocommerce/components';
import classNames from 'classnames';

/**
 * Internal dependencies
 */
import './style.scss';

export type PillType = 'primary' | 'success' | 'alert' | 'danger' | 'light';

type PillProps = {
	type?: PillType;
	className?: string;
	children?: ReactNode;
};

const Pill: FC< PillProps > = ( { type = '', className = '', children } ) => {
	const types = [ 'primary', 'success', 'alert', 'danger', 'light' ];

	const classes = classNames(
		`wcpay-pill${ types.includes( type ) ? '__' + type : '' }`,
		className
	);

	return <WC_Pill className={ classes }>{ children }</WC_Pill>;
};

export default Pill;
