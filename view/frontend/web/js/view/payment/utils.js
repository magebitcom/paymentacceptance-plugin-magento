define([
    'mage/url',
    'jquery',
    'mage/storage',
    'Magento_Customer/js/model/authentication-popup',
    'Magento_Ui/js/modal/modal',
    'Airwallex_Payments/js/view/payment/recaptcha/webapiReCaptcha',
    'Airwallex_Payments/js/view/payment/recaptcha/webapiReCaptchaRegistry',
    'Magento_Customer/js/customer-data',
    'Magento_Ui/js/modal/alert',
    'Magento_Customer/js/model/customer',
    'Magento_Checkout/js/model/payment/place-order-hooks',
    'Magento_Checkout/js/model/error-processor'
], function (
    urlBuilder,
    $,
    storage,
    popup,
    modal,
    webapiReCaptcha,
    webapiRecaptchaRegistry,
    customerData,
    alert,
    customer,
    placeOrderHooks,
    errorProcessor
) {
    'use strict';

    return {
        productFormSelector: "#product_addtocart_form",
        guestEmailSelector: "#customer-email",
        cartPageIdentitySelector: '.cart-summary',
        checkoutPageIdentitySelector: '#co-payment-form',
        buttonMaskSelector: '.aws-button-mask',
        buttonMaskSelectorForLogin: '.aws-button-mask-for-login',
        expressData: {},
        paymentConfig: {},
        recaptchaSelector: '.airwallex-recaptcha',
        recaptchaId: 'recaptcha-checkout-place-order',

        getRecaptchaId() {
            let id = $('.airwallex-card-container .g-recaptcha').attr('id');
            if (id) {
                return id;
            }
            if ($('#recaptcha-checkout-place-order').length) {
                return this.recaptchaId;
            }
            return '';
        },

        clearDataAfterPay(response, customerData) {
            const clearData = {
                'selectedShippingAddress': null,
                'shippingAddressFromData': null,
                'newCustomerShippingAddress': null,
                'selectedShippingRate': null,
                'selectedPaymentMethod': null,
                'selectedBillingAddress': null,
                'billingAddressFromData': null,
                'newCustomerBillingAddress': null
            };

            if (response && response.responseType !== 'error') {
                customerData.set('checkout-data', clearData);
                customerData.invalidate(['cart']);
                customerData.reload(['cart'], true);
            }
        },

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
            if (popup.modalWindow) {
                popup.showModal();
            } else {
                alert({
                    content: $.mage.__('Guest checkout is disabled.')
                });
            }
        },

        initCheckoutPageExpressCheckoutClick() {
            if (this.isCheckoutPage() && !this.isLoggedIn() && this.expressData.is_virtual) {
                this.checkGuestEmailInput();
                $(this.guestEmailSelector).off('input.awx').on('input.awx', () => {
                    this.checkGuestEmailInput();
                });
                $(this.buttonMaskSelector).off('click.awx').on('click.awx', (e) => {
                    e.stopPropagation();
                    $($(this.guestEmailSelector).closest('form')).valid();
                    this.checkGuestEmailInput();
                });
            }
        },

        checkGuestEmailInput() {
            if ($(this.guestEmailSelector).closest('form').validate().checkForm()) {
                $(this.buttonMaskSelector).hide();
            } else {
                $(this.buttonMaskSelector).show();
            }
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
                    this.validateProductOptions();
                });
                $.each($(this.productFormSelector)[0].elements, (index, element) => {
                    $(element).on('change', () => {
                        this.validateProductOptions();
                    });
                });
            }
        },

        loadRecaptcha(isShowRecaptcha) {
            if (!$(this.recaptchaSelector).length) {
                return;
            }

            if (this.paymentConfig.is_recaptcha_enabled && !$('#recaptcha-checkout-place-order').length) {
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
            let modalSelector = $('#awx-modal');
            modal({ title: 'Error' }, modalSelector);

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

        processPlaceOrderError: function (response) {
            $('body').trigger('processStop');
            if (response && response.getResponseHeader) {
                errorProcessor.process(response, this.messageContainer);
                const redirectURL = response.getResponseHeader('errorRedirectAction');

                if (redirectURL) {
                    setTimeout(function () {
                        errorProcessor.redirectTo(redirectURL);
                    }, 3000);
                }
            } else if (response && response.message) {
                this.validationError(response.message);
            }
        },

        pay(self, from, quote) {
            let that = this;
            $('body').trigger('processStart');

            const payload = {
                cartId: quote.getQuoteId(),
                billingAddress: quote.billingAddress(),
                paymentMethod: {
                    method: 'airwallex_payments_card',
                    additional_data: {},
                },
            };

            let serviceUrl = urlBuilder.build('rest/V1/airwallex/payments/guest-place-order');
            if (customer.isLoggedIn()) {
                serviceUrl = urlBuilder.build('rest/V1/airwallex/payments/place-order');
                payload.email = quote.guestEmail;
            }

            let headers = {};
            _.each(placeOrderHooks.requestModifiers, function (modifier) {
                modifier(headers, payload);
            });

            payload.intent_id = null;

            (new Promise(async function (resolve, reject) {
                try {
                    if (self.isRecaptchaEnabled) {
                        let recaptchaRegistry = require('Magento_ReCaptchaWebapiUi/js/webapiReCaptchaRegistry');

                        if (recaptchaRegistry) {
                            payload.xReCaptchaValue = await new Promise((resolve, reject) => {
                                recaptchaRegistry.addListener(that.getRecaptchaId(), (token) => {
                                    resolve(token);
                                });
                                recaptchaRegistry.triggers[that.getRecaptchaId()]();
                            });
                        }
                    }

                    const intentResponse = await storage.post(
                        serviceUrl, JSON.stringify(payload), true, 'application/json', headers
                    );

                    let response = {};
                    if (from === 'vault') {
                        const selectedConsentId = $("#v-" + $('input[name="payment[method]"]:checked').val()).val();
                        response = await Airwallex.confirmPaymentIntent({
                            intent_id: intentResponse.intent_id,
                            client_secret: intentResponse.client_secret,
                            payment_consent_id: selectedConsentId,
                            element: self.cvcElement,
                            payment_method: {
                                billing: self.getBillingInformation()
                            },
                            payment_method_options: {
                                card: {
                                    auto_capture: self.autoCapture
                                }
                            },
                        });
                    } else {
                        if (self.isSaveCardSelected() && self.getCustomerId()) {
                            response = await Airwallex.createPaymentConsent({
                                intent_id: intentResponse.intent_id,
                                customer_id: self.getCustomerId(),
                                client_secret: intentResponse.client_secret,
                                currency: quote.totals().quote_currency_code,
                                billing: self.getBillingInformation(),
                                element: self.cardElement,
                                next_triggered_by: 'customer',
                            });
                        } else {
                            response = await Airwallex.confirmPaymentIntent({
                                intent_id: intentResponse.intent_id,
                                client_secret: intentResponse.client_secret,
                                payment_method: {
                                    billing: self.getBillingInformation()
                                },
                                element: self.cardElement
                            });
                        }
                    }

                    payload.intent_id = intentResponse.intent_id;
                    payload.paymentMethod.additional_data.intent_id = intentResponse.intent_id;

                    const endResult = await storage.post(
                        serviceUrl, JSON.stringify(payload), true, 'application/json', headers
                    );

                    resolve(endResult);
                } catch (e) {
                    reject(e);
                }
            })).then(function (response) {
                that.clearDataAfterPay(response, customerData)
                // window.location.replace(urlBuilder.build('checkout/onepage/success/'));
            }).catch(
                that.processPlaceOrderError.bind(self)
            ).finally(
                function () {
                    _.each(placeOrderHooks.afterRequestListeners, function (listener) {
                        listener();
                    });

                    if (self.isPlaceOrderActionAllowed) {
                        self.isPlaceOrderActionAllowed(true);
                    }

                    setTimeout(() => {
                        $('body').trigger('processStop');
                    }, 1000)
                }
            );

        }
    };
});
