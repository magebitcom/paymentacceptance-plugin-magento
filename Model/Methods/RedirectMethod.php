<?php

namespace Airwallex\Payments\Model\Methods;

use GuzzleHttp\Exception\GuzzleException;
use Magento\Framework\Exception\AlreadyExistsException;
use Magento\Framework\Exception\LocalizedException;
use Magento\Payment\Model\InfoInterface;
use Magento\Quote\Api\Data\CartInterface;
use Mobile_Detect;
use Exception;

class RedirectMethod extends AbstractMethod
{
    public const DANA_CODE = 'airwallex_payments_dana';
    public const ALIPAYCN_CODE = 'airwallex_payments_alipaycn';
    public const ALIPAYHK_CODE = 'airwallex_payments_alipayhk';
    public const GCASH_CODE = 'airwallex_payments_gcash';
    public const KAKAO_CODE = 'airwallex_payments_kakaopay';
    public const TOUCH_N_GO_CODE = 'airwallex_payments_tng';
    public const WECHAT_CODE = 'airwallex_payments_wechatpay';
    
    /**
     * @param InfoInterface $payment
     * @param float $amount
     *
     * @return $this
     * @throws GuzzleException
     * @throws AlreadyExistsException
     * @throws LocalizedException
     */
    public function authorize(InfoInterface $payment, $amount): self
    {
        /** @var \Magento\Sales\Model\Order\Payment $payment */
        $intendResponse = $this->paymentIntents->createIntent();
        $intentId = $intendResponse['id'];
        /** @var \Magento\Sales\Model\Order\Payment $payment */
        $payment->setTransactionId($intentId);
        $detect = new Mobile_Detect();
        try {
            $returnUrl = $this->confirm
                ->setPaymentIntentId($intentId)
                ->setInformation($this->getPaymentMethodCode(), $detect->isMobile(), $this->getMobileOS($detect))
                ->send();
        } catch (Exception $exception) {
            throw new LocalizedException(__($exception->getMessage()));
        }

        $this->checkoutHelper->getCheckout()->setAirwallexPaymentsRedirectUrl($returnUrl);

        return $this;
    }

    /**
     * @param Mobile_Detect $detect
     *
     * @return string|null
     */
    private function getMobileOS(Mobile_Detect $detect): ?string
    {
        if (!$detect->isMobile()) {
            return null;
        }

        return $detect->isAndroidOS() ? 'android' : 'ios';
    }

    /**
     * @param CartInterface|null $quote
     *
     * @return bool
     */
    public function isAvailable(CartInterface $quote = null): bool
    {
        return parent::isAvailable($quote) &&
            $this->availablePaymentMethodsHelper->isMobileDetectInstalled();
    }
}
