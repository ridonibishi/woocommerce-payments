<?php
/**
 * Class WC_REST_Payments_Settings_Controller
 *
 * @package WooCommerce\Payments\Admin
 */

defined( 'ABSPATH' ) || exit;

/**
 * REST controller for settings.
 */
class WC_REST_Payments_Settings_Controller extends WC_Payments_REST_Controller {

	/**
	 * Endpoint path.
	 *
	 * @var string
	 */
	protected $rest_base = 'payments/settings';

	/**
	 * Instance of WC_Payment_Gateway_WCPay.
	 *
	 * @var WC_Payment_Gateway_WCPay
	 */
	private $wcpay_gateway;

	/**
	 * WC_REST_Payments_Settings_Controller constructor.
	 *
	 * @param WC_Payments_API_Client   $api_client WC_Payments_API_Client instance.
	 * @param WC_Payment_Gateway_WCPay $wcpay_gateway WC_Payment_Gateway_WCPay instance.
	 */
	public function __construct( WC_Payments_API_Client $api_client, WC_Payment_Gateway_WCPay $wcpay_gateway ) {
		parent::__construct( $api_client );

		$this->wcpay_gateway = $wcpay_gateway;
	}

	/**
	 * Configure REST API routes.
	 */
	public function register_routes() {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			[
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => [ $this, 'get_settings' ],
				'permission_callback' => [ $this, 'check_permission' ],
			]
		);
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			[
				'methods'             => WP_REST_Server::EDITABLE,
				'callback'            => [ $this, 'update_settings' ],
				'permission_callback' => [ $this, 'check_permission' ],
				'args'                => [
					'is_wcpay_enabled'             => [
						'description'       => __( 'If WooCommerce Payments should be enabled.', 'woocommerce-payments' ),
						'type'              => 'boolean',
						'validate_callback' => 'rest_validate_request_arg',
					],
					'enabled_payment_method_ids'   => [
						'description'       => __( 'Payment method IDs that should be enabled. Other methods will be disabled.', 'woocommerce-payments' ),
						'type'              => 'array',
						'items'             => [
							'type' => 'string',
							'enum' => $this->wcpay_gateway->get_upe_available_payment_methods(),
						],
						'validate_callback' => 'rest_validate_request_arg',
					],
					'is_manual_capture_enabled'    => [
						'description'       => __( 'If WooCommerce Payments manual capture of charges should be enabled.', 'woocommerce-payments' ),
						'type'              => 'boolean',
						'validate_callback' => 'rest_validate_request_arg',
					],
					'account_statement_descriptor' => [
						'description'       => __( 'WooCommerce Payments bank account descriptor to be displayed in customers\' bank accounts.', 'woocommerce-payments' ),
						'type'              => 'string',
						'validate_callback' => 'rest_validate_request_arg',
					],
				],
			]
		);
	}

	/**
	 * Retrieve settings.
	 *
	 * @return WP_REST_Response
	 */
	public function get_settings(): WP_REST_Response {
		return new WP_REST_Response(
			[
				'enabled_payment_method_ids'   => $this->wcpay_gateway->get_upe_enabled_payment_method_ids(),
				'available_payment_method_ids' => $this->wcpay_gateway->get_upe_available_payment_methods(),
				'is_wcpay_enabled'             => $this->wcpay_gateway->is_enabled(),
				'is_manual_capture_enabled'    => 'yes' === $this->wcpay_gateway->get_option( 'manual_capture' ) ? true : false,
				'account_statement_descriptor' => $this->wcpay_gateway->get_option( 'account_statement_descriptor' ),
			]
		);
	}

	/**
	 * Update settings.
	 *
	 * @param WP_REST_Request $request Full data about the request.
	 */
	public function update_settings( WP_REST_Request $request ) {
		$this->update_is_wcpay_enabled( $request );
		$this->update_enabled_payment_methods( $request );
		$this->update_is_manual_capture_enabled( $request );
		$this->update_account_statement_descriptor( $request );

		return new WP_REST_Response( [], 200 );
	}

	/**
	 * Updates WooCommerce Payments enabled status.
	 *
	 * @param WP_REST_Request $request Request object.
	 */
	private function update_is_wcpay_enabled( WP_REST_Request $request ) {
		if ( ! $request->has_param( 'is_wcpay_enabled' ) ) {
			return;
		}

		$is_wcpay_enabled = $request->get_param( 'is_wcpay_enabled' );

		if ( $is_wcpay_enabled ) {
			$this->wcpay_gateway->enable();
		} else {
			$this->wcpay_gateway->disable();
		}
	}

	/**
	 * Updates the list of enabled payment methods.
	 *
	 * @param WP_REST_Request $request Request object.
	 */
	private function update_enabled_payment_methods( WP_REST_Request $request ) {
		if ( ! $request->has_param( 'enabled_payment_method_ids' ) ) {
			return;
		}

		$payment_method_ids_to_enable = $request->get_param( 'enabled_payment_method_ids' );
		$available_payment_methods    = $this->wcpay_gateway->get_upe_available_payment_methods();

		$payment_method_ids_to_enable = array_values(
			array_filter(
				$payment_method_ids_to_enable,
				function ( $payment_method ) use ( $available_payment_methods ) {
					return in_array( $payment_method, $available_payment_methods, true );
				}
			)
		);

		$this->wcpay_gateway->update_option( 'enabled_payment_method_ids', $payment_method_ids_to_enable );
	}

	/**
	 * Updates WooCommerce Payments manual capture.
	 *
	 * @param WP_REST_Request $request Request object.
	 */
	private function update_is_manual_capture_enabled( WP_REST_Request $request ) {
		if ( ! $request->has_param( 'is_manual_capture_enabled' ) ) {
			return;
		}

		$is_manual_capture_enabled = $request->get_param( 'is_manual_capture_enabled' );

		$this->wcpay_gateway->update_option( 'manual_capture', $is_manual_capture_enabled ? 'yes' : 'no' );
	}

	/**
	 * Updates WooCommerce Payments account statement descriptor.
	 *
	 * @param WP_REST_Request $request Request object.
	 */
	private function update_account_statement_descriptor( WP_REST_Request $request ) {
		if ( ! $request->has_param( 'account_statement_descriptor' ) ) {
			return;
		}

		$account_statement_descriptor = $request->get_param( 'account_statement_descriptor' );

		$this->wcpay_gateway->update_option( 'account_statement_descriptor', $account_statement_descriptor );
	}
}
