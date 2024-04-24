define(
    [
        'jquery',
        'ko',
        'mage/storage',
        'Magento_Customer/js/customer-data',
        'mage/url',
        'uiComponent',
        'Magento_ReCaptchaWebapiUi/js/webapiReCaptchaRegistry',
        'Magento_ReCaptchaWebapiUi/js/webapiReCaptcha',
        'Magento_Customer/js/model/authentication-popup',
        'Airwallex_Payments/js/view/payment/method-renderer/address/address-handler',
        'Airwallex_Payments/js/view/payment/method-renderer/express/utils',
        'Airwallex_Payments/js/view/payment/method-renderer/express/googlepay',
    ],

    function (
        $,
        ko,
        storage,
        customerData,
        urlBuilder,
        Component,
        recaptchaRegistry,
        recaptchaFactory,
        popup,
        addressHandler,
        utils,
        googlepay,
    ) {
        'use strict';

        return Component.extend({
            code: 'airwallex_payments_express',
            defaults: {
                paymentConfig: {},
                googlepay: null,
                expressData: {},
                guestEmail: "",
                billingAddress: {},
                showMinicartSelector: '.showcart',
                isShow: false,
                expressDisplayArea: ko.observable(''), // displayArea is a key word
                buttonSort: ko.observableArray([]),
                recaptchaId: 'recaptcha-checkout-place-order',
                isShowRecaptcha: ko.observable(false),
            },

            setGuestEmail(email) {
                this.guestEmail = email
            },

            async fetchExpressData() {
                let url = urlBuilder.build('rest/V1/airwallex/payments/express-data');
                if (utils.isProductPage()) {
                    url += "?is_product_page=1&product_id=" + $("input[name=product]").val()
                }
                const resp = await storage.get(url, undefined, 'application/json', {});
                let obj = JSON.parse(resp)
                this.updateExpressData(obj)
                this.updatePaymentConfig(obj.settings)
            },

            async postAddress(address, methodId) {
                let url = urlBuilder.build('rest/V1/airwallex/payments/post-address');
                let postOptions = utils.postOptions(address, url)
                postOptions.data.append('methodId', methodId)
                let resp = await $.ajax(postOptions)

                let obj = JSON.parse(resp)
                this.updateExpressData(obj.quote_data)
                this.updateMethods(obj.methods, obj.selected_method)
                addressHandler.regionId = obj.region_id
                return obj
            },

            updateExpressData(expressData) {
                Object.assign(this.expressData, expressData)
                Object.assign(utils.expressData, expressData)
                Object.assign(googlepay.expressData, expressData)
                utils.toggleMaskFormLogin()
            },

            updatePaymentConfig(paymentConfig) {
                this.paymentConfig = paymentConfig
                utils.paymentConfig = paymentConfig
                googlepay.paymentConfig = paymentConfig
            },

            updateMethods(methods, selectedMethod) {
                addressHandler.methods = methods
                googlepay.methods = methods
                addressHandler.selectedMethod = selectedMethod
                googlepay.selectedMethod = selectedMethod
            },

            initMinicartClickEvents() {
                if (!$(this.showMinicartSelector).length) {
                    return
                }

                let recreateGooglepay = async () => {
                    if (!$(this.showMinicartSelector).hasClass('active')) {
                        return
                    }
                    Airwallex.destroyElement('googlePayButton');
                    await this.fetchExpressData();
                    if (this.from === 'minicart' && utils.isCartEmpty(this.expressData)) {
                        return
                    }
                    googlepay.create(this)
                }

                let cartData = customerData.get('cart')
                cartData.subscribe(recreateGooglepay, this);

                if (this.from !== 'minicart' || utils.isFromMinicartAndShouldNotShow(this.from)) {
                    return
                }
                $(this.showMinicartSelector).on("click", recreateGooglepay)
            },

            async initialize() {
                this._super();

                this.isShow = ko.observable(false)

                await this.fetchExpressData()

                if (!this.paymentConfig.is_express_active || this.paymentConfig.display_area.indexOf(this.from) === -1) {
                    return
                }

                if (utils.isFromMinicartAndShouldNotShow(this.from)) {
                    return
                }

                googlepay.from = this.from
                this.paymentConfig.express_button_sort.forEach(v => {
                    this.buttonSort.push(v)
                })

                Airwallex.init({
                    env: this.paymentConfig.mode,
                    origin: window.location.origin,
                });

                this.isShow(true)

                this.initMinicartClickEvents()
                utils.initProductPageFormClickEvents()
                this.initHashPaymentEvent()
                this.loadRecaptcha()
            },

            async loadPayment() {
                if (this.from === 'minicart' && utils.isCartEmpty(this.expressData)) {
                    return
                }
                googlepay.create(this)
            },

            loadRecaptcha() {
                if (this.paymentConfig.is_recaptcha_enabled && !utils.isCheckoutPage() && !window.grecaptcha) {
                    this.isShowRecaptcha(true)
                    let re = recaptchaFactory()
                    re.reCaptchaId = this.recaptchaId
                    re.settings = this.paymentConfig.recaptcha_settings
                    re.renderReCaptcha()
                    if (!utils.isCheckoutPage()) {
                        $(".airwallex-recaptcha").css({
                            'visibility': 'hidden',
                            'position': 'absolute'
                        })
                    }
                }
            },

            initHashPaymentEvent() {
                window.addEventListener('hashchange', async () => {
                    if (window.location.hash === '#payment') {
                        Airwallex.destroyElement('googlePayButton');
                        // we need update quote, because we choose shipping method last step
                        await this.fetchExpressData();
                        googlepay.create(this)
                    }
                });
            },

            placeOrder() {
                $('body').trigger('processStart');
                const payload = {
                    cartId: utils.getCartId(),
                    paymentMethod: {
                        method: this.code,
                        additional_data: {
                            amount: 0,
                            intent_status: 0
                        }
                    }
                };

                let serviceUrl = urlBuilder.build('rest/V1/airwallex/payments/guest-place-order')
                if (utils.isLoggedIn()) {
                    serviceUrl = urlBuilder.build('rest/V1/airwallex/payments/place-order');
                }

                payload.intent_id = null;

                (new Promise(async (resolve, reject) => {
                    try {
                        payload.xReCaptchaValue = await new Promise((resolve, reject) => {
                            recaptchaRegistry.addListener(this.recaptchaId, (token) => {
                                resolve(token);
                            });
                            recaptchaRegistry.triggers[this.recaptchaId]();
                        });

                        if (!utils.isLoggedIn()) {
                            payload.email = utils.isCheckoutPage() ? $("#customer-email").val() : this.guestEmail;
                        }

                        const intentResponse = await storage.post(
                            serviceUrl, JSON.stringify(payload), true, 'application/json', {}
                        );

                        const params = {};
                        params.id = intentResponse.intent_id;
                        params.client_secret = intentResponse.client_secret;
                        params.payment_method = {};
                        params.payment_method.billing = this.billingAddress;

                        payload.intent_id = intentResponse.intent_id;
                        if (utils.isRequireShippingOption()) {
                            payload.billingAddress = addressHandler.getBillingAddressToPlaceOrder(this.billingAddress)
                        }
                        await googlepay.confirmIntent(params);

                        const endResult = await storage.post(
                            serviceUrl, JSON.stringify(payload), true, 'application/json', {}
                        );
                        resolve(endResult);
                    } catch (e) {
                        Airwallex.destroyElement('googlePayButton');
                        googlepay.create(this)
                        reject(e);
                    }
                })).then(response => {
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

                    if (response?.responseType !== 'error') {
                        customerData.set('checkout-data', clearData);
                        customerData.invalidate(['cart']);
                        customerData.reload(['cart'], true);
                    }

                    window.location.replace(urlBuilder.build('checkout/onepage/success/'));
                }).catch(
                    utils.error.bind(utils)
                ).finally(() => {
                    setTimeout(() => {
                        $('body').trigger('processStop')
                    }, 3000)
                });
            },
        });
    }
);
