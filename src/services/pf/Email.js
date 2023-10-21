const Mailgen = require('mailgen');
const Async = require('async');
const path= require('path');
const sgMail = require('@sendgrid/mail');
const Merge = require('merge');
const EJS = require('ejs');

class Email {
    config= {};
    isInitialized= false;

    constructor(apiKey, config) {
        this.config= config||{};
        if (config?.dontSend){
            return;
        }
        sgMail.setApiKey(apiKey);
        this.sgMail= sgMail;
        this.defaultFrom = 'info@qristix.com';

        const mailGenerator = new Mailgen({
            // theme: 'default',
            theme: {
                // Build an absolute path to the theme file within your project
                path: path.resolve(__dirname, '../../tpls/email/themes/t1/index.html'),
                // Also (optionally) provide the path to a plaintext version of the theme (if you wish to use `generatePlaintext()`)
                plaintextPath: path.resolve(__dirname,'../../tpls/email/themes/t1/index.txt')
            },
            product: {
                name: 'QRisTix',
                link: 'https://qristix.com/',
                // Custom copyright notice
                copyright: 'Copyright © 2023 QRisTix. All rights reserved.',
            }
        });
        this.mailGenerator = mailGenerator;
        this.isInitialized= true;
    }

    testHtml (subject, template, params, to, a_from, callback) {
        // Generate the plaintext version of the e-mail (for clients that do not support HTML)
        // let emailText = mailGenerator.generatePlaintext(template);

        // Optionally, preview the generated HTML e-mail by writing it to a local file
        let emailBody = this.mailGenerator.generate(require('../../tpls/email/'+template));
        require('fs').writeFileSync('preview.html', emailBody, 'utf8');
        callback();
    }

    send (subject, template, params, to, a_from, callback) {
        if (!this.isInitialized){
            console.log('email service not initialized');
            return callback();
        }
        let from    = a_from || this.defaultFrom;

        // Generate an HTML email with the provided contents
        let templateContent= require('../../tpls/email/'+template);
        if (params&& params.templateData){
            templateContent = Merge.recursive(true, templateContent, params.templateData);
        }
        let emailBody = this.mailGenerator.generate(templateContent);

        if (this.config.testing){
            to= this.config.testEmail;
        }
        const msg = {
            to: to||from,
            cc: from,
            from: from,
            subject: subject,
            // text: 'and easy to do anywhere, even with Node.js',
            html: emailBody,
        }
        console.log('>>>>About to send email');
        if(this.config?.dontSend){
            console.log(`Email To Send: ${to} > ${subject}`);
            return callback();
        }
        this.sgMail
            .send(msg)
            .then(() => {
                console.log('Email sent to', to, subject);
                callback();
            })
            .catch((error) => {
                console.log('Email sending failed for ', to, subject);
                console.error(error)
            })

    }

    sendEJS (subject, template, params, to, a_from, callback) {
        let from    = a_from || this.defaultFrom;
        let emailBody = '';
        if (this.config.testing){
            to= this.config.testEmail;
        }
        if(this.config?.dontSend){
            console.log(`Email To Send: ${to} > ${subject}`);
            return callback();
        }
        // Generate an HTML email with the provided contents
        EJS.renderFile(template, params, {}, (err, str)=>{
            if(err){
                console.log(err);
                return callback(err);
            }
            emailBody = str;
            const msg = {
                to: to||from,
                // cc: from,
                from: from,
                subject: subject,
                // text: 'and easy to do anywhere, even with Node.js',
                html: emailBody,
            }
            this.sgMail
                .send(msg)
                .then(() => {
                    console.log('Email sent to', to);
                    callback();
                })
                .catch((error) => {
                    console.log('Email sending failed for ', to);
                    console.error(JSON.stringify(error))
                    callback();
                })
        });
    }
};

module.exports = Email;
