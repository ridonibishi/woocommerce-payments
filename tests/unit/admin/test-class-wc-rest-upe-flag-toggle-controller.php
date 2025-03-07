<?php
/**
 * Class WC_REST_UPE_Flag_Toggle_Controller
 *
 * @package WooCommerce\Payments\Tests
 */

use WCPay\Database_Cache;
use WCPay\Duplicate_Payment_Prevention_Service as Duplicate_Payment_Prevention_Service;
use WCPay\Session_Rate_Limiter;

/**
 * WC_REST_UPE_Flag_Toggle_Controller unit tests.
 */
class WC_REST_UPE_Flag_Toggle_Controller_Test extends WCPAY_UnitTestCase {

	/**
	 * Tested REST route.
	 */
	const ROUTE = '/wc/v3/payments/upe_flag_toggle';

	/**
	 * The system under test.
	 *
	 * @var WC_REST_UPE_Flag_Toggle_Controller
	 */
	private $controller;

	/**
	 * Gateway.
	 *
	 * @var WC_Payment_Gateway_WCPay
	 */
	private $gateway;

	/**
	 * Pre-test setup
	 */
	public function set_up() {
		parent::set_up();

		// Set the user so that we can pass the authentication.
		wp_set_current_user( 1 );

		$mock_api_client = $this->getMockBuilder( WC_Payments_API_Client::class )
			->disableOriginalConstructor()
			->getMock();

		$mock_wcpay_account       = $this->createMock( WC_Payments_Account::class );
		$this->mock_db_cache      = $this->createMock( Database_Cache::class );
		$customer_service         = new WC_Payments_Customer_Service( $mock_api_client, $mock_wcpay_account, $this->mock_db_cache );
		$token_service            = new WC_Payments_Token_Service( $mock_api_client, $customer_service );
		$order_service            = new WC_Payments_Order_Service( $mock_api_client );
		$action_scheduler_service = new WC_Payments_Action_Scheduler_Service( $mock_api_client, $order_service );
		$rate_limiter             = new Session_Rate_Limiter( 'wcpay_card_declined_registry', 5, 60 );
		$mock_dpps                = $this->createMock( Duplicate_Payment_Prevention_Service::class );

		$this->gateway    = new WC_Payment_Gateway_WCPay(
			$mock_api_client,
			$mock_wcpay_account,
			$customer_service,
			$token_service,
			$action_scheduler_service,
			$rate_limiter,
			$order_service,
			$mock_dpps,
			$this->createMock( WC_Payments_Localization_Service::class )
		);
		$this->controller = new WC_REST_UPE_Flag_Toggle_Controller( $this->gateway );
		update_option( WC_Payments_Features::UPE_FLAG_NAME, '0' );
		update_option( WC_Payments_Features::UPE_SPLIT_FLAG_NAME, '0' );
		update_option( WC_Payments_Features::UPE_DEFERRED_INTENT_FLAG_NAME, '0' );
	}

	public function tear_down() {
		parent::tear_down();
		update_option( WC_Payments_Features::UPE_FLAG_NAME, '0' );
		update_option( WC_Payments_Features::UPE_SPLIT_FLAG_NAME, '0' );
		update_option( WC_Payments_Features::UPE_DEFERRED_INTENT_FLAG_NAME, '0' );
	}

	public function test_get_flag_fails_if_user_cannot_manage_woocommerce() {
		// Set the user so that we can pass the authentication.
		wp_set_current_user( 1 );

		$cb = $this->create_can_manage_woocommerce_cap_override( false );
		add_filter( 'user_has_cap', $cb );
		$response = rest_do_request( new WP_REST_Request( 'GET', self::ROUTE ) );
		$this->assertEquals( 403, $response->get_status() );
		remove_filter( 'user_has_cap', $cb );

		$cb = $this->create_can_manage_woocommerce_cap_override( true );
		add_filter( 'user_has_cap', $cb );
		$response = rest_do_request( new WP_REST_Request( 'GET', self::ROUTE ) );
		$this->assertEquals( 200, $response->get_status() );
		remove_filter( 'user_has_cap', $cb );
	}

	public function test_get_flag_request_returns_status_code_200() {
		$response = $this->controller->get_flag();

		$this->assertEquals( 200, $response->get_status() );
	}

	public function test_set_flag_without_param_returns_status_code_200() {
		$request  = new WP_REST_Request( 'POST', self::ROUTE );
		$response = $this->controller->set_flag( $request );

		$this->assertEquals( 200, $response->get_status() );
		// no change from the initial flag value.
		$this->assertEquals( '0', get_option( WC_Payments_Features::UPE_FLAG_NAME ) );
		$this->assertEquals( '0', get_option( WC_Payments_Features::UPE_SPLIT_FLAG_NAME ) );
		$this->assertEquals( '0', get_option( WC_Payments_Features::UPE_DEFERRED_INTENT_FLAG_NAME ) );
	}

	public function test_set_flag_disabled_with_split_returns_status_code_200() {
		update_option( WC_Payments_Features::UPE_SPLIT_FLAG_NAME, '1' );
		$request = new WP_REST_Request( 'POST', self::ROUTE );
		$request->set_param( 'is_upe_enabled', false );

		$response = $this->controller->set_flag( $request );

		$this->assertEquals( 200, $response->get_status() );
		$this->assertEquals( '0', get_option( WC_Payments_Features::UPE_FLAG_NAME ) );
		$this->assertEquals( 'disabled', get_option( WC_Payments_Features::UPE_SPLIT_FLAG_NAME ) );
	}

	public function test_set_flag_disabled_with_deferred_intent_returns_status_code_200() {
		update_option( WC_Payments_Features::UPE_DEFERRED_INTENT_FLAG_NAME, '1' );
		$request = new WP_REST_Request( 'POST', self::ROUTE );
		$request->set_param( 'is_upe_enabled', false );

		$response = $this->controller->set_flag( $request );

		$this->assertEquals( 200, $response->get_status() );
		$this->assertEquals( '0', get_option( WC_Payments_Features::UPE_FLAG_NAME ) );
		$this->assertEquals( 'disabled', get_option( WC_Payments_Features::UPE_DEFERRED_INTENT_FLAG_NAME ) );
	}

	public function test_set_flag_enabled_request_returns_status_code_200() {
		$request = new WP_REST_Request( 'POST', self::ROUTE );
		$request->set_param( 'is_upe_enabled', true );

		$response = $this->controller->set_flag( $request );

		$this->assertEquals( 200, $response->get_status() );
		$this->assertEquals( '1', get_option( WC_Payments_Features::UPE_DEFERRED_INTENT_FLAG_NAME ) );
	}

	public function test_set_flag_disabled_request_returns_status_code_200() {
		$this->gateway->update_option(
			'upe_enabled_payment_method_ids',
			[
				'card',
				'giropay',
			]
		);
		update_option( WC_Payments_Features::UPE_FLAG_NAME, '1' );
		$this->assertEquals( '1', get_option( WC_Payments_Features::UPE_FLAG_NAME ) );

		$request = new WP_REST_Request( 'POST', self::ROUTE );
		$request->set_param( 'is_upe_enabled', false );

		$response = $this->controller->set_flag( $request );

		$this->assertEquals( 200, $response->get_status() );
		$this->assertEquals( 'disabled', get_option( WC_Payments_Features::UPE_FLAG_NAME, null ) );
		$this->assertEquals(
			[
				'card',
			],
			$this->gateway->get_option(
				'upe_enabled_payment_method_ids'
			)
		);
	}

	/**
	 * @param bool $can_manage_woocommerce
	 *
	 * @return Closure
	 */
	private function create_can_manage_woocommerce_cap_override( bool $can_manage_woocommerce ) {
		return function ( $allcaps ) use ( $can_manage_woocommerce ) {
			$allcaps['manage_woocommerce'] = $can_manage_woocommerce;

			return $allcaps;
		};
	}
}
