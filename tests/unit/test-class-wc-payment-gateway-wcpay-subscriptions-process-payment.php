<?php
/**
 * Class WC_Payment_Gateway_WCPay_Test
 *
 * @package WooCommerce\Payments\Tests
 */

use WCPay\Core\Server\Request\Create_And_Confirm_Intention;
use WCPay\Core\Server\Request\Create_And_Confirm_Setup_Intention;
use WCPay\Core\Server\Response;
use WCPay\Constants\Order_Status;
use WCPay\Constants\Intent_Status;
use WCPay\Duplicate_Payment_Prevention_Service;
use WCPay\Session_Rate_Limiter;

/**
 * WC_Payment_Gateway_WCPay unit tests.
 */
class WC_Payment_Gateway_WCPay_Subscriptions_Process_Payment_Test extends WCPAY_UnitTestCase {
	const USER_ID           = 1;
	const CUSTOMER_ID       = 'cus_mock';
	const PAYMENT_METHOD_ID = 'pm_mock';
	const CHARGE_ID         = 'ch_mock';
	const SETUP_INTENT_ID   = 'si_mock';
	const PAYMENT_INTENT_ID = 'pi_mock';
	const TOKEN_REQUEST_KEY = 'wc-' . WC_Payment_Gateway_WCPay::GATEWAY_ID . '-payment-token';

	/**
	 * System under test.
	 *
	 * @var WC_Payment_Gateway_WCPay_Subscriptions_Compat
	 */
	private $mock_wcpay_gateway;

	/**
	 * Mock WC_Payments_Customer_Service.
	 *
	 * @var WC_Payments_Customer_Service|PHPUnit_Framework_MockObject_MockObject
	 */
	private $mock_customer_service;

	/**
	 * Mock WC_Payments_Token_Service.
	 *
	 * @var WC_Payments_Token_Service|PHPUnit_Framework_MockObject_MockObject
	 */
	private $mock_token_service;

	/**
	 * Mock WC_Payments_API_Client.
	 *
	 * @var WC_Payments_API_Client|PHPUnit_Framework_MockObject_MockObject
	 */
	private $mock_api_client;

	/**
	 * Mock WC_Payments_Action_Scheduler_Service.
	 *
	 * @var WC_Payments_Action_Scheduler_Service|PHPUnit_Framework_MockObject_MockObject
	 */
	private $mock_action_scheduler_service;

	/**
	 * Mock Session_Rate_Limiter.
	 *
	 * @var Session_Rate_Limiter|PHPUnit_Framework_MockObject_MockObject
	 */
	private $mock_rate_limiter;

	/**
	 * WC_Payments_Order_Service.
	 *
	 * @var WC_Payments_Order_Service
	 */
	private $order_service;

	/**
	 * Mock WC_Payments_Account.
	 *
	 * @var WC_Payments_Account|PHPUnit_Framework_MockObject_MockObject
	 */
	private $mock_wcpay_account;

	/**
	 * Setup intent to be used during tests.
	 *
	 * @var WC_Payments_API_Setup_Intention
	 */
	private $setup_intent;

	/**
	 * Payment intent to be used during tests.
	 *
	 * @var WC_Payments_API_Payment_Intention
	 */
	private $payment_intent;

	/**
	 * Token to be used during the tests.
	 *
	 * @var WC_Payment_Token
	 */
	private $token;

	public function set_up() {
		parent::set_up();

		wp_set_current_user( self::USER_ID );
		$this->payment_intent = WC_Helper_Intention::create_intention();
		$this->setup_intent   = WC_Helper_Intention::create_setup_intention(
			[
				'id'             => self::SETUP_INTENT_ID,
				'status'         => Intent_Status::SUCCEEDED,
				'client_secret'  => 'test_client_secret',
				'next_action'    => [],
				'payment_method' => self::PAYMENT_METHOD_ID,
			]
		);

		$this->mock_api_client = $this->getMockBuilder( 'WC_Payments_API_Client' )
			->disableOriginalConstructor()
			->getMock();

		$this->mock_wcpay_account = $this->createMock( WC_Payments_Account::class );

		$this->mock_customer_service = $this->getMockBuilder( 'WC_Payments_Customer_Service' )
			->disableOriginalConstructor()
			->getMock();

		$this->mock_token_service = $this->getMockBuilder( 'WC_Payments_Token_Service' )
			->disableOriginalConstructor()
			->getMock();

		$this->mock_action_scheduler_service = $this->getMockBuilder( 'WC_Payments_Action_Scheduler_Service' )
			->disableOriginalConstructor()
			->getMock();

		$this->mock_rate_limiter = $this->createMock( Session_Rate_Limiter::class );

		$this->order_service = new WC_Payments_Order_Service( $this->mock_api_client );

		$mock_dpps = $this->createMock( Duplicate_Payment_Prevention_Service::class );

		$this->mock_wcpay_gateway = $this->getMockBuilder( '\WC_Payment_Gateway_WCPay' )
			->setConstructorArgs(
				[
					$this->mock_api_client,
					$this->mock_wcpay_account,
					$this->mock_customer_service,
					$this->mock_token_service,
					$this->mock_action_scheduler_service,
					$this->mock_rate_limiter,
					$this->order_service,
					$mock_dpps,
					$this->createMock( WC_Payments_Localization_Service::class ),
				]
			)
			->setMethods(
				[
					'get_return_url',
					'mark_payment_complete_for_order',
					'get_level3_data_from_order', // To avoid needing to mock the order items.
				]
			)
			->getMock();

		$this->mock_customer_service
			->expects( $this->once() )
			->method( 'get_customer_id_by_user_id' )
			->with( get_current_user_id() )
			->willReturn( self::CUSTOMER_ID );

		$this->mock_customer_service
			->expects( $this->once() )
			->method( 'update_customer_for_user' )
			->willReturn( self::CUSTOMER_ID );

		$this->token = WC_Helper_Token::create_token( self::PAYMENT_METHOD_ID, self::USER_ID );

		$_POST = [
			'wcpay-payment-method' => self::PAYMENT_METHOD_ID,
			'payment_method'       => WC_Payment_Gateway_WCPay::GATEWAY_ID,
		];
	}

	public function test_new_card_subscription() {
		$order         = WC_Helper_Order::create_order( self::USER_ID );
		$subscriptions = [ new WC_Subscription() ];
		$subscriptions[0]->set_parent( $order );

		$this->mock_wcs_order_contains_subscription( true );
		$this->mock_wcs_get_subscriptions_for_order( $subscriptions );

		$this->mock_customer_service
			->expects( $this->once() )
			->method( 'get_customer_id_by_user_id' )
			->with( self::USER_ID )
			->willReturn( self::CUSTOMER_ID );

		$request = $this->mock_wcpay_request( Create_And_Confirm_Intention::class );

		$request->expects( $this->once() )
			->method( 'set_customer' )
			->with( self::CUSTOMER_ID );

		$request->expects( $this->once() )
			->method( 'set_payment_method' )
			->with( self::PAYMENT_METHOD_ID );

		$request->expects( $this->once() )
			->method( 'set_cvc_confirmation' )
			->with( null );

		$request->expects( $this->once() )
			->method( 'set_amount' )
			->with( 5000 )
			->willReturn( $request );

		$request->expects( $this->once() )
			->method( 'set_currency_code' )
			->with( 'usd' )
			->willReturn( $request );

		$request->expects( $this->once() )
			->method( 'setup_future_usage' );

		$request->expects( $this->once() )
			->method( 'set_capture_method' )
			->with( false );

		$request->expects( $this->once() )
			->method( 'set_off_session' )
			->with( false );

		$request->expects( $this->once() )
			->method( 'set_capture_method' )
			->with( false )
			->willReturn( $request );

		$request->expects( $this->once() )
			->method( 'set_metadata' )
			->with(
				$this->callback(
					function( $metadata ) {
						$required_keys = [ 'customer_name', 'customer_email', 'site_url', 'order_id', 'order_number', 'order_key', 'payment_type' ];
						foreach ( $required_keys as $key ) {
							if ( ! array_key_exists( $key, $metadata ) ) {
								return false;
							}
						}
						return true;
					}
				)
			);
		$request->expects( $this->once() )
			->method( 'format_response' )
			->willReturn( $this->payment_intent );

		$this->mock_token_service
			->expects( $this->once() )
			->method( 'add_payment_method_to_user' )
			->with( $this->payment_intent->get_payment_method_id(), $order->get_user() )
			->willReturn( $this->token );

		$result       = $this->mock_wcpay_gateway->process_payment( $order->get_id() );
		$result_order = wc_get_order( $order->get_id() );

		$this->assertEquals( Order_Status::PROCESSING, $result_order->get_status() );
		$this->assertEquals( 'success', $result['result'] );

		// Expect add token to order to be called, so it can be reused in renewals.
		// This is an integration test, different scenarios for add_token_to_order method
		// are tested in WC_Payment_Gateway_WCPay_Subscriptions_Test.
		$orders = array_merge( [ $order ], $subscriptions );
		foreach ( $orders as $order ) {
			$payment_tokens = $order->get_payment_tokens();
			$this->assertEquals( $this->token->get_id(), end( $payment_tokens ) );
		}
	}

	public function test_new_card_zero_dollar_subscription() {
		$order         = WC_Helper_Order::create_order( self::USER_ID, 0 );
		$subscriptions = [ new WC_Subscription() ];
		$subscriptions[0]->set_parent( $order );

		$this->mock_wcs_order_contains_subscription( true );
		$this->mock_wcs_get_subscriptions_for_order( $subscriptions );

		$request = $this->mock_wcpay_request( Create_And_Confirm_Setup_Intention::class );

		$request->expects( $this->once() )
			->method( 'set_customer' )
			->with( self::CUSTOMER_ID );

		$request->expects( $this->once() )
			->method( 'set_payment_method' )
			->with( self::PAYMENT_METHOD_ID );

		$request->expects( $this->once() )
			->method( 'format_response' )
			->willReturn( $this->setup_intent );

		$this->mock_token_service
			->expects( $this->once() )
			->method( 'add_payment_method_to_user' )
			->with( self::PAYMENT_METHOD_ID, $order->get_user() )
			->willReturn( $this->token );

		$result       = $this->mock_wcpay_gateway->process_payment( $order->get_id() );
		$result_order = wc_get_order( $order->get_id() );

		$this->assertEquals( Order_Status::PROCESSING, $result_order->get_status() );
		$this->assertEquals( 'success', $result['result'] );

		// Expect add token to order to be called, so it can be reused in renewals.
		// This is an integration test, different scenarios for add_token_to_order method
		// are tested in WC_Payment_Gateway_WCPay_Subscriptions_Test.
		$orders = array_merge( [ $order ], $subscriptions );
		foreach ( $orders as $order ) {
			$payment_tokens = $order->get_payment_tokens();
			$this->assertEquals( $this->token->get_id(), end( $payment_tokens ) );
		}
	}

	public function test_new_card_is_added_before_status_update() {
		$order         = WC_Helper_Order::create_order( self::USER_ID, 0 );
		$subscriptions = [ new WC_Subscription() ];
		$subscriptions[0]->set_parent( $order );

		$request = $this->mock_wcpay_request( Create_And_Confirm_Setup_Intention::class );

		$request->expects( $this->once() )
			->method( 'format_response' )
			->willReturn( $this->setup_intent );

		$this->mock_token_service
			->expects( $this->once() )
			->method( 'add_payment_method_to_user' )
			->with( self::PAYMENT_METHOD_ID, $order->get_user() )
			->willReturn( $this->token );

		$result = $this->mock_wcpay_gateway->process_payment( $order->get_id() );

		// Expect add token to order to be called, so it can be reused in renewals.
		// This is an integration test, different scenarios for add_token_to_order method
		// are tested in WC_Payment_Gateway_WCPay_Subscriptions_Test.
		$orders = array_merge( [ $order ], $subscriptions );
		foreach ( $orders as $order ) {
			$payment_tokens = $order->get_payment_tokens();
			$this->assertEquals( $this->token->get_id(), end( $payment_tokens ) );
		}
	}

	public function test_saved_card_subscription() {
		$order         = WC_Helper_Order::create_order( self::USER_ID );
		$subscriptions = [ new WC_Subscription() ];
		$subscriptions[0]->set_parent( $order );

		$_POST = [
			'payment_method'        => WC_Payment_Gateway_WCPay::GATEWAY_ID,
			self::TOKEN_REQUEST_KEY => $this->token->get_id(),
		];

		$this->mock_wcs_order_contains_subscription( true );
		$this->mock_wcs_get_subscriptions_for_order( $subscriptions );

		$request = $this->mock_wcpay_request( Create_And_Confirm_Intention::class );

		$request->expects( $this->once() )
			->method( 'set_customer' )
			->with( self::CUSTOMER_ID );

		$request->expects( $this->once() )
			->method( 'set_payment_method' )
			->with( self::PAYMENT_METHOD_ID );

		$request->expects( $this->once() )
			->method( 'set_cvc_confirmation' )
			->with( null );

		$request->expects( $this->once() )
			->method( 'set_amount' )
			->with( 5000 )
			->willReturn( $request );

		$request->expects( $this->once() )
			->method( 'set_currency_code' )
			->with( 'usd' )
			->willReturn( $request );

		$request->expects( $this->never() )
			->method( 'setup_future_usage' );

		$request->expects( $this->once() )
			->method( 'set_capture_method' )
			->with( false );

		$request->expects( $this->once() )
			->method( 'set_off_session' )
			->with( false );

		$request->expects( $this->once() )
			->method( 'set_capture_method' )
			->with( false )
			->willReturn( $request );

		$request->expects( $this->once() )
			->method( 'set_metadata' )
			->with(
				$this->callback(
					function( $metadata ) {
						$required_keys = [ 'customer_name', 'customer_email', 'site_url', 'order_id', 'order_number', 'order_key', 'payment_type' ];
						foreach ( $required_keys as $key ) {
							if ( ! array_key_exists( $key, $metadata ) ) {
								return false;
							}
						}
						return true;
					}
				)
			);

		$request->expects( $this->once() )
			->method( 'format_response' )
			->willReturn( $this->payment_intent );

		$this->mock_token_service
			->expects( $this->never() )
			->method( 'add_payment_method_to_user' );

		$result       = $this->mock_wcpay_gateway->process_payment( $order->get_id() );
		$result_order = wc_get_order( $order->get_id() );

		$this->assertEquals( Order_Status::PROCESSING, $result_order->get_status() );
		$this->assertEquals( 'success', $result['result'] );

		// Expect add token to order to be called, so it can be reused in renewals.
		// This is an integration test, different scenarios for add_token_to_order method
		// are tested in WC_Payment_Gateway_WCPay_Subscriptions_Test.
		$orders = array_merge( [ $order ], $subscriptions );
		foreach ( $orders as $order ) {
			$payment_tokens = $order->get_payment_tokens();
			$this->assertEquals( $this->token->get_id(), end( $payment_tokens ) );
		}
	}

	public function test_saved_card_zero_dollar_subscription() {
		$order         = WC_Helper_Order::create_order( self::USER_ID, 0 );
		$subscriptions = [ new WC_Subscription() ];
		$subscriptions[0]->set_parent( $order );

		$this->mock_wcs_order_contains_subscription( true );
		$this->mock_wcs_get_subscriptions_for_order( $subscriptions );

		$_POST = [
			'payment_method'        => WC_Payment_Gateway_WCPay::GATEWAY_ID,
			self::TOKEN_REQUEST_KEY => $this->token->get_id(),
		];

		// The card is already saved and there's no payment needed, so no Setup Intent needs to be created.
		$request = $this->mock_wcpay_request( Create_And_Confirm_Setup_Intention::class, 0 );

		// We're not saving a new payment method, so we don't need to add the payment method to
		// a user account.
		$this->mock_token_service
			->expects( $this->never() )
			->method( 'add_payment_method_to_user' );

		$result       = $this->mock_wcpay_gateway->process_payment( $order->get_id() );
		$result_order = wc_get_order( $order->get_id() );

		$this->assertEquals( 'processing', $result_order->get_status() );
		$this->assertEquals( 'success', $result['result'] );

		// We do need to add the payment method to the order so we can charge it when it's time to
		// renew the order or when the free trial is over.
		// This is an integration test, different scenarios for add_token_to_order method
		// are tested in WC_Payment_Gateway_WCPay_Subscriptions_Test.
		$orders = array_merge( [ $order ], $subscriptions );
		foreach ( $orders as $order ) {
			$payment_tokens = $order->get_payment_tokens();
			$this->assertEquals( $this->token->get_id(), end( $payment_tokens ) );
		}

	}

	public function test_card_is_saved_when_updating_subscription_payment_method() {
		$order = WC_Helper_Order::create_order( self::USER_ID, 0 );

		$_GET = [ 'change_payment_method' => 10 ];

		$this->mock_wcs_order_contains_subscription( false );

		WC_Subscriptions::set_wcs_is_subscription(
			function ( $order ) {
				return true;
			}
		);

		$this->mock_wcs_get_subscriptions_for_order( [] );
		$request = $this->mock_wcpay_request( Create_And_Confirm_Setup_Intention::class );

		$request->expects( $this->once() )
			->method( 'set_customer' )
			->with( self::CUSTOMER_ID );

		$request->expects( $this->once() )
			->method( 'set_payment_method' )
			->with( self::PAYMENT_METHOD_ID );

		$request->expects( $this->once() )
			->method( 'format_response' )
			->willReturn( $this->setup_intent );

		$this->mock_token_service
			->expects( $this->once() )
			->method( 'add_payment_method_to_user' )
			->with( self::PAYMENT_METHOD_ID, $order->get_user() )
			->willReturn( $this->token );

		$result       = $this->mock_wcpay_gateway->process_payment( $order->get_id() );
		$result_order = wc_get_order( $order->get_id() );

		$this->assertEquals( 'processing', $result_order->get_status() );
		$this->assertEquals( 'success', $result['result'] );
		// Expect add token to order to be called, so it can be reused in renewals.
		// This is an integration test, different scenarios for add_token_to_order method
		// are tested in WC_Payment_Gateway_WCPay_Subscriptions_Test.
		$payment_tokens = $order->get_payment_tokens();
		$this->assertEquals( $this->token->get_id(), end( $payment_tokens ) );
	}

	public function test_card_is_saved_when_updating_subscription_using_saved_payment_method() {
		$order = WC_Helper_Order::create_order( self::USER_ID, 0 );

		$_POST = [
			'payment_method'        => WC_Payment_Gateway_WCPay::GATEWAY_ID,
			self::TOKEN_REQUEST_KEY => $this->token->get_id(),
		];
		$_GET  = [ 'change_payment_method' => 10 ];

		$this->mock_wcs_order_contains_subscription( false );

		WC_Subscriptions::set_wcs_is_subscription(
			function ( $order ) {
				return true;
			}
		);
		$this->mock_wcs_get_subscriptions_for_order( [] );

		$request = $this->mock_wcpay_request( Create_And_Confirm_Setup_Intention::class, 0 );

		$this->mock_token_service
			->expects( $this->never() )
			->method( 'add_payment_method_to_user' );

		$result       = $this->mock_wcpay_gateway->process_payment( $order->get_id() );
		$result_order = wc_get_order( $order->get_id() );

		$this->assertEquals( 'processing', $result_order->get_status() );
		$this->assertEquals( 'success', $result['result'] );
		// Expect add token to order to be called, so it can be reused in renewals.
		// This is an integration test, different scenarios for add_token_to_order method
		// are tested in WC_Payment_Gateway_WCPay_Subscriptions_Test.
		$payment_tokens = $order->get_payment_tokens();
		$this->assertEquals( $this->token->get_id(), end( $payment_tokens ) );
	}

	private function mock_wcs_order_contains_subscription( $value ) {
		WC_Subscriptions::set_wcs_order_contains_subscription(
			function ( $order ) use ( $value ) {
				return $value;
			}
		);
	}

	private function mock_wcs_get_subscriptions_for_order( $subscriptions ) {
		WC_Subscriptions::set_wcs_get_subscriptions_for_order(
			function ( $order ) use ( $subscriptions ) {
				return $subscriptions;
			}
		);
	}

	private function match_order_id( $order_id ) {
		return function ( $order ) use ( $order_id ) {
			return $order_id === $order->get_id();
		};
	}

	private function match_order_status( $status ) {
		return function ( $order ) use ( $status ) {
			return $status === $order->get_status();
		};
	}
}
