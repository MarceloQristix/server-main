/**
 * @desc Initializes db connections and models
 */

const Mongoose = require('mongoose');

const Models = require("../models");

const init = (app, doneCb) => {

    const Logger = app.locals.Logger;
    const Config = app.locals.Config;
    const MONGODB_URL = app.locals.credentials.dbUrl;
    const DEBUG= app.locals.credentials.debug||false;
    const MONGODB_OPTIONS = Config.get('db.server.options');

    app.locals.MONGODB_URL = MONGODB_URL;
    app.locals.MONGODB_OPTIONS = MONGODB_OPTIONS;

    Mongoose.set('debug', DEBUG);
    Mongoose.set('useNewUrlParser', true);
    Mongoose.set('useFindAndModify', false);
    Mongoose.set('useCreateIndex', true);
    Mongoose.set('useUnifiedTopology', true);

    const connection = Mongoose.createConnection(MONGODB_URL, MONGODB_OPTIONS);

    connection.on('connected', function (err) {
        app.locals.Db = connection;
        app.locals.models = {};
        Models.load(app, 'global', (err) => {
            doneCb(err);
        });
    });

    connection.on('error', (err) => {
        Logger.info('Mongodb Connection error!');
        Logger.error(err);
    });

};

const shutdown = (app, doneCb) => {
    app.locals.Db.close();
    return doneCb();
};

module.exports = {
    init: init,
    shutdown: shutdown
};
