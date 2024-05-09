<?php
/**
 * This file is part of the Airwallex Payments module.
 *
 * DISCLAIMER
 *
 * Do not edit or add to this file if you wish to upgrade
 * to newer versions in the future.
 *
 * @copyright Copyright (c) 2021 Magebit, Ltd. (https://magebit.com/)
 * @license   GNU General Public License ("GPL") v3.0
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
namespace Airwallex\Payments\Model\Methods;

use Airwallex\Payments\Api\Data\PaymentIntentInterface;
use GuzzleHttp\Exception\GuzzleException;
use Magento\Framework\Exception\LocalizedException;
use Magento\Payment\Model\InfoInterface;
use Airwallex\Payments\Model\Client\Request\PaymentIntents\Get;

class CardMethod extends AbstractMethod
{
    public const CODE = 'airwallex_payments_card';

    /**
     * @param InfoInterface $payment
     * @param float $amount
     *
     * @return $this
     * @throws LocalizedException
     */
    public function capture(InfoInterface $payment, $amount): self
    {
        $intentId = $this->getIntentId();

        $order = $payment->getOrder();
        $targetAmount = $this->priceCurrency->convert($amount, $order->getStore(), $order->getOrderCurrencyCode());

        $payment->setTransactionId($intentId);

        $resp = $this->intentGet->setPaymentIntentId($intentId)->send();
        $respArr = json_decode($resp, true);
        if (!isset($respArr['status'])) {
            throw new LocalizedException(__('Something went wrong while trying to capture the payment.'));
        }

        if ($respArr['status'] === PaymentIntentInterface::INTENT_STATUS_REQUIRES_CAPTURE) {
            try {
                $result = $this->capture
                    ->setPaymentIntentId($intentId)
                    ->setInformation($targetAmount)
                    ->send();
                $this->logger->error(sprintf('Credit Card: Payment Intent %s, Capture information', $intentId));
                $this->getInfoInstance()->setAdditionalInformation('intent_status', $result->status);
            } catch (GuzzleException $exception) {
                $this->logger->orderError($payment->getOrder(), 'capture', $exception->getMessage());
            }
        }

        return $this;
    }

    /**
     * @return string
     */
    public function getConfigPaymentAction(): string
    {
        return $this->getConfigData('airwallex_payment_action');
    }
}
