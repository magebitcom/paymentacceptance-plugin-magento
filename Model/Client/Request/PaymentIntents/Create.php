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
 * @license   GNU General Public License ('GPL') v3.0
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
namespace Airwallex\Payments\Model\Client\Request\PaymentIntents;

use Airwallex\Payments\Model\Client\AbstractClient;
use Airwallex\Payments\Model\Client\Interfaces\BearerAuthenticationInterface;
use Magento\Quote\Model\Quote;
use Magento\Quote\Model\Quote\Item;
use Psr\Http\Message\ResponseInterface;

class Create extends AbstractClient implements BearerAuthenticationInterface
{
    private const ROUND_DECIMAL_CURRENCY = [
        'KRW',
        'PHP',
    ];

    private const MULTIPLE_CURRENCY_PRICE = 100;

    /**
     * @param Quote $quote
     * @param string $returnUrl
     *
     * @return AbstractClient|Create
     */
    public function setQuote(Quote $quote, string $returnUrl): self
    {
        $shippingAddress = $quote->getShippingAddress();

        return $this->setParams([
            'amount' => $this->getAmount($quote),
            'currency' => $quote->getQuoteCurrencyCode(),
            'merchant_order_id' => $quote->getReservedOrderId(),
            'supplementary_amount' => 1,
            'return_url' => $returnUrl,
            'order' => [
                'products' => array_values(array_filter($this->getQuoteProducts($quote))),
                'shipping' => [
                    'fist_name' => $shippingAddress->getName(),
                    'last_name' => $shippingAddress->getLastname(),
                    'phone_number' => $shippingAddress->getTelephone(),
                    'shipping_method' => $shippingAddress->getShippingMethod(),
                    'address' => [
                        'city' => $shippingAddress->getCity(),
                        'country_code' => $shippingAddress->getCountryId(),
                        'postcode' => $shippingAddress->getPostcode(),
                        'state' => $shippingAddress->getRegion(),
                        'street' => current($shippingAddress->getStreet()),
                    ]
                ]
            ]
        ]);
    }

    /**
     * @return string
     */
    protected function getUri(): string
    {
        return 'pa/payment_intents/create';
    }

    /**
     * @param ResponseInterface $request
     *
     * @return array
     * @throws \JsonException
     */
    protected function parseResponse(ResponseInterface $request): array
    {
        $data = $this->parseJson($request);

        return [
            'clientSecret' =>  $data->client_secret,
            'id' =>  $data->id,
        ];
    }

    /**
     * @param Quote $quote
     *
     * @return array
     */
    private function getQuoteProducts(Quote $quote): array
    {
        return array_map(static function (Item $item) {
            if ((float) $item->getPrice() === 0.0) {
                return null;
            }

            $child = $item->getChildren();
            $child = $child ? current($child) : null;
            $name = $child ? $child->getName() : $item->getName();

            return [
                'code' => $item->getSku(),
                'desc' => $name,
                'name' => $name,
                'quantity' => $item->getQty(),
                'sku' => $item->getSku(),
                'unit_price' => $item->getPrice(),
                'url' => $item->getProduct()->getProductUrl()
            ];
        }, $quote->getAllItems());
    }

    /**
     * @param Quote $quote
     *
     * @return float
     */
    private function getAmount(Quote $quote): float
    {
        $currency =  $quote->getQuoteCurrencyCode();
        $baseTotal = $quote->getBaseGrandTotal();

        if (in_array($currency, self::ROUND_DECIMAL_CURRENCY, true)) {
            return round($baseTotal);
        }

        if ($currency === 'IDR') {
            return $baseTotal * self::MULTIPLE_CURRENCY_PRICE;
        }

        return $baseTotal;
    }
}
