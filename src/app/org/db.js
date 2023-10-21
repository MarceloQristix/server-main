/**
 * @desc Initializes db connections and models
 */

const Mongoose = require('mongoose');
const Async = require('async');

const Models = require("../../models");

const DEP_SIZE= {
    small: 2,
    medium: 5,
    large: 10
};

const init = function (app, mode, doneCb) {

    const Logger = app.locals.Logger;
    const Config = app.locals.Config;
    let dbSuffix= app.locals.id;
    const Settings= app.locals.Settings;
    if (Settings.useShortName){
        dbSuffix= Settings.shortName;
    }
    const MONGODB_URL = app.locals.credentials.dbUrl.replace('saas', Config.get('db.orgPrefix')+dbSuffix);
    const MONGODB_OPTIONS = {...Config.get('db.server.options')};
    if (mode === 'business_api'){
        MONGODB_OPTIONS.poolSize= DEP_SIZE[app.locals.Settings.size];
    }
    const connection = Mongoose.createConnection(MONGODB_URL, MONGODB_OPTIONS);

    console.log('org db url', MONGODB_URL);
    connection.on('connected', function (err) {
        app.locals.Db = connection;
        app.locals.models = {};
        Models.load(app, 'org', (err) => {
            const loadDefaultData = (next) => {
                return next();
            };

            Async.series([loadDefaultData], doneCb);
        });
    });

    connection.on('error', (err) => {
        Logger.error('Mongodb Connection error!');
        if (!app.locals.Db) {    //failed to initialize
            doneCb(err);
        }
    });
};

const shutdown = function (app, doneCb) {
    app.locals.Db.close();
    return doneCb();
};

module.exports = {
    init,
    shutdown
};
