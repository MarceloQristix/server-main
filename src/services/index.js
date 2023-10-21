/**
 * @param app
 * @param doneCb
 * @returns {*}
 */

const Path = require('path');
const PushNotification = require("./pf/PushNotification");

const init = function (app, doneCb) {
    const EmailKlass = require('./pf/Email');
    const PushNotification = require("./pf/PushNotification");
    const SMS= require('./pf/SMS');

    if (!app.locals.services){
        app.locals.services= {};
    }
    app.locals.services.Email = new EmailKlass(app.locals.credentials.sendgridApiKey, app.locals.credentials.email);
    let firebaseAccount= '';
    try {
        let keyFilePath= Path.join(app.locals.rootDir, app.locals.credentials.firebasePrivateKeyFile);
        firebaseAccount = require(keyFilePath);
    }
    catch (e){
        console.log('firebase admin secret does not exist');
    }
    app.locals.services.PushNotification = new PushNotification(firebaseAccount);
    app.locals.services.SMS= new SMS(app.locals.credentials.sms);

    return doneCb();
};

const shutdown = function (app, doneCb) {
    return doneCb();
};

module.exports = {
    init,
    shutdown
};
