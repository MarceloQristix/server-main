
const request = require("request");
const ES6Template = require("es6-template-string");

class SMS {
    REQUEST_OPTIONS= {};
    isInitialized= false;
    dontSend= false;
    config= {};

    constructor(config) {
        if (!config){
            return;
        }
        this.config= config;
        this.dontSend= config.dontSend; //only log data, don't send
        this.REQUEST_OPTIONS= {
            method: 'GET',
            url: config.apiUrl,
            qs: {
                authkey: config.apiKey,
                sms: '',
                mobile: '',
                country_code: '91', //India hardcoded
                sender: config.senderId,
                pe_id: config.pe_id,
                // sid: config.sid
            },
        };
        this.isInitialized= true;
    }

    send(mobileNumber, template, data, cb, smsOptions){
        console.log('About to send sms')
        let message= ES6Template(template.text, data);
        if (message === template.text){ //not an ES6 template
            const regex = /\{.+?\}/ig;
            const VAR_PLACEHOLDER= '####'
            let templateText= template.text.replace(regex, VAR_PLACEHOLDER);
            let arr= data.arr;
            message= templateText.replace(VAR_PLACEHOLDER, arr[0])
                    .replace(VAR_PLACEHOLDER, arr[1]);
        }
        if (message === template.text){
            return cb('Template does not seem to have variables specified in the right format!');
        }
        if ((message.indexOf('#') !== -1)||(message.indexOf('{') !== -1)){
            return cb('Template seems to have extra variables set');
        }
        const templateId= template.id;
        let actualMobileNumber;

        if (!this.isInitialized){
            console.log('SMS could not be sent as service not initialized:', mobileNumber, message);
            return cb('SMS service not initialized!');
        }
        if (this.config.testing){
            actualMobileNumber= mobileNumber;
            mobileNumber= this.config.testMobile;
        }
        let options;
        if (smsOptions?.useSubAccount){
            let subAccountConfig= {...smsOptions.config};
            options= {
                method: 'GET',
                url: this.config.subAccountApiUrl,
                qs: {
                    auth: subAccountConfig.apiKey,
                    message:message, // message you want to send //required if type=1
                    template_id: templateId, // optional but need to upload it once in panel
                    msisdn: mobileNumber,//this is comma separated mobile numbers (max 1000)
                    senderid: subAccountConfig.senderId||this.config.senderId // required
                    // countrycode=enter country code // optional for india country
                    // type=1 // optional for unicode message
                    // entity_id=pass your entity id // optional but need to upload it once in panel
                    // flash_message=1 for flash sms //optional only required if you want to send flash sms

                },
            }
        }
        else {
            options= JSON.parse(JSON.stringify(this.REQUEST_OPTIONS));
            options.qs.mobile= mobileNumber;
            options.qs.sms= message;
            options.qs.template_id= templateId;
        }

        if (this.dontSend){
            console.log(`SMS To Send: ${template.name} > ${mobileNumber} (${actualMobileNumber||''}) -- ${message}`);
            return cb();
        }

        console.log('Triggering SMS to: ', mobileNumber);
        request(options, (error, response, body) =>{
            if (error) {
                console.log('SMS error:', mobileNumber, message, error);
                return cb(error);
            }
            console.log('SMS response:', mobileNumber, message, body);
            return cb();
        });
    }
};

module.exports = SMS;
