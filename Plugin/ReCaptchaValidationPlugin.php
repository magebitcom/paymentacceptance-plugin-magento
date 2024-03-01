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

namespace Airwallex\Payments\Plugin;

use Magento\Framework\App\CacheInterface;
use Magento\Framework\Validation\ValidationResultFactory;
use Magento\Framework\Webapi\Rest\Request as RestRequest;
use Magento\ReCaptchaValidation\Model\Validator;
use Magento\ReCaptchaValidationApi\Api\Data\ValidationConfigInterface;

/**
 * Enable ReCaptcha validation bypass for the 2nd request in the chain
 */
class ReCaptchaValidationPlugin
{
    const WHITELIST_PATHS = [
        '/V1/airwallex/payments/guest-place-order' => true,
        '/V1/airwallex/payments/place-order' => true
    ];

    const CACHE_PREFIX = 'RC_BYPASS';

    protected RestRequest $request;
    protected CacheInterface $cache;
    protected ValidationResultFactory $validationResultFactory;

    public function __construct(
        RestRequest $request,
        CacheInterface $cache,
        ValidationResultFactory $validationResultFactory
    ) {
        $this->request = $request;
        $this->cache = $cache;
        $this->validationResultFactory = $validationResultFactory;
    }

    public function aroundIsValid(
        Validator $subject,
        callable $proceed,
        string $reCaptchaResponse,
        ValidationConfigInterface $validationConfig
    ) {
        $uriPath = $this->request->getPathInfo();
        if (array_key_exists($uriPath, self::WHITELIST_PATHS)
            && $this->validateBypassReCaptcha()) {
            return $this->validationResultFactory->create(['errors' => []]);
        }

        return $proceed($reCaptchaResponse, $validationConfig);
    }

    protected function validateBypassReCaptcha(): bool
    {
        $intentId = $this->request->getRequestData()['intent_id'] ?: false;
        if (!$intentId) {
            return false;
        }

        if ($this->cache->load(self::getCacheKey($intentId))) {
            $this->cache->remove(self::getCacheKey($intentId));
            return true;
        }

        return false;
    }

    public static function getCacheKey(string $intentId): string
    {
        return implode('_', [self::CACHE_PREFIX, $intentId]);
    }
}
