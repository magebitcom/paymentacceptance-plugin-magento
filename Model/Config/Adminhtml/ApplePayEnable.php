<?php

namespace Airwallex\Payments\Model\Config\Adminhtml;

use Magento\Config\Block\System\Config\Form\Field;
use Magento\Framework\Data\Form\Element\AbstractElement;

class ApplePayEnable extends Field
{
    public string $type = 'apple';
    protected $_template = 'Airwallex_Payments::config/pay_enable.phtml';

    protected function _getElementHtml(AbstractElement $element): string
    {
        return parent::_getElementHtml($element) . $this->_toHtml();
    }
}
