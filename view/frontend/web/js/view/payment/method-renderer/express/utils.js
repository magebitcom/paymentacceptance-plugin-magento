define([
    'mage/url',
    'jquery',
    'Magento_Customer/js/model/authentication-popup',
    'Magento_Ui/js/modal/modal',
    'Magento_ReCaptchaWebapiUi/js/webapiReCaptcha',
    'Magento_ReCaptchaWebapiUi/js/webapiReCaptchaRegistry',
    'Magento_Customer/js/customer-data',
], function (
    urlBuilder,
    $,
    popup,
    modal,
    webapiReCaptcha,
    webapiRecaptchaRegistry,
    customerData,
) {
    'use strict';

    return {
        productFormSelector: "#product_addtocart_form",
        cartPageIdentitySelector: '.cart-summary',
        checkoutPageIdentitySelector: '#co-payment-form',
        buttonMaskSelector: '.aws-button-mask',
        buttonMaskSelectorForLogin: '.aws-button-mask-for-login',
        expressData: {},
        paymentConfig: {},
        recaptchaSelector: '.airwallex-recaptcha',
        recaptchaId: 'recaptcha-checkout-place-order',

        getDiscount(subtotal, subtotal_with_discount) {
            let diff = subtotal - subtotal_with_discount;
            return diff.toFixed(2);
        },

        formatCurrency(v) {
            return parseFloat(v).toFixed(2);
        },

        isCartEmpty() {
            return !parseInt(this.expressData.items_qty);
        },

        isProductPage() {
            return !!$(this.productFormSelector).length;
        },

        isCartPage() {
            return !!$(this.cartPageIdentitySelector).length;
        },

        isCheckoutPage() {
            return !!$(this.checkoutPageIdentitySelector).length;
        },

        checkProductForm() {
            let formSelector = $(this.productFormSelector);
            if (formSelector.length === 0 || !formSelector.validate) {
                return true;
            }
            return $(formSelector).validate().checkForm();
        },

        validateProductOptions() {
            if (this.checkProductForm()) {
                $(this.productFormSelector).valid();
                $(this.buttonMaskSelector).hide();
            } else {
                $(this.buttonMaskSelector).show();
            }
        },

        showLoginForm(e) {
            e.preventDefault();
            popup.showModal();
        },

        initProductPageFormClickEvents() {
            if (this.isProductPage() && this.isSetActiveInProductPage()) {
                this.validateProductOptions();
                $(this.productFormSelector).on("click", () => {
                    this.validateProductOptions();
                });
                $(this.buttonMaskSelector).on('click', (e) => {
                    e.stopPropagation();
                    $(this.productFormSelector).valid();
                });
            }
        },

        loadRecaptcha(isShowRecaptcha) {
            if (!$(this.recaptchaSelector).length) {
                return;
            }

            if (this.paymentConfig.is_recaptcha_enabled && !this.isCheckoutPage() && !window.grecaptcha && !window.isShowAwxGrecaptcha) {
                window.isShowAwxGrecaptcha = true;
                isShowRecaptcha(true);
                let re = webapiReCaptcha();
                re.reCaptchaId = this.recaptchaId;
                re.settings = this.paymentConfig.recaptcha_settings;
                re.renderReCaptcha();
                $(this.recaptchaSelector).css({
                    'visibility': 'hidden',
                    'position': 'absolute'
                });
            }
        },

        async recaptchaToken() {
            return await new Promise((resolve) => {
                webapiRecaptchaRegistry.addListener(this.recaptchaId, (token) => {
                    resolve(token);
                });
                webapiRecaptchaRegistry.triggers[this.recaptchaId]();
            });
        },

        toggleMaskFormLogin() {
            if (this.isLoggedIn()) {
                return;
            }
            if (this.isCheckoutPage()) {
                return;
            }
            if (!$(this.buttonMaskSelectorForLogin).length) {
                return;
            }
            if ((this.isProductPage() && this.expressData.product_is_virtual) || this.expressData.is_virtual) {
                $(this.buttonMaskSelectorForLogin).show();
                $(this.buttonMaskSelectorForLogin).on('click', this.showLoginForm);
            } else {
                $(this.buttonMaskSelectorForLogin).remove('click', this.showLoginForm);
                $(this.buttonMaskSelectorForLogin).hide();
            }
        },

        isSetActiveInProductPage() {
            return this.paymentConfig.display_area.indexOf('product_page') !== -1;
        },

        isSetActiveInCartPage() {
            return this.paymentConfig.display_area.indexOf('cart_page') !== -1;
        },

        isFromMinicartAndShouldNotShow(from) {
            if (from !== 'minicart') {
                return false;
            }
            if (this.isProductPage() && this.isSetActiveInProductPage()) {
                return true;
            }
            return this.isCartPage() && this.isSetActiveInCartPage();
        },

        isRequireShippingOption() {
            if (this.isProductPage()) {
                if (this.isCartEmpty()) {
                    return !this.expressData.product_is_virtual;
                }
                return !this.expressData.is_virtual || !this.expressData.product_is_virtual;
            }
            return this.isRequireShippingAddress();
        },

        isRequireShippingAddress() {
            if (this.isProductPage()) {
                return true;
            }
            if (this.isCheckoutPage()) {
                return false;
            }
            return !this.expressData.is_virtual;
        },

        postOptions(data, url) {
            let formData = new FormData();
            if (Array.isArray(data)) {
                $.each(data, function (index, field) {
                    formData.append(field.name, field.value);
                });
            } else {
                for (let k in data) {
                    formData.append(k, data[k]);
                }
            }

            return {
                url,
                data: formData,
                processData: false,
                contentType: false,
                type: 'POST',
            };
        },

        addToCartOptions() {
            let arr = $(this.productFormSelector).serializeArray();
            let url = urlBuilder.build('rest/V1/airwallex/payments/add-to-cart');
            return this.postOptions(arr, url);
        },

        async addToCart(that) {
            if (this.isProductPage() && this.isSetActiveInProductPage()) {
                try {
                    let res = await $.ajax(this.addToCartOptions());
                    that.updateExpressData(JSON.parse(res));
                } catch (res) {
                    this.error(res);
                }
                customerData.invalidate(['cart']);
                customerData.reload(['cart'], true);
            }
        },

        getCartId() {
            return this.isLoggedIn() ? this.expressData.cart_id : this.expressData.mask_cart_id;
        },

        isLoggedIn() {
            return !!this.expressData.customer_id;
        },

        error(response) {
            console.log(response);
            let modalSelector = $('#awx-modal');
            modal({title: 'Error'}, modalSelector);

            $('body').trigger('processStop');
            let errorMessage = $.mage.__(response.message);
            if (response.responseText) {
                errorMessage = $.mage.__(response.responseText);
            }
            if (response.responseJSON) {
                errorMessage = $.mage.__(response.responseJSON.message);
            }

            $("#awx-modal .modal-body-content").html(errorMessage);
            modalSelector.modal('openModal');
        },
    };
});
