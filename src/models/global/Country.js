const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Async = require('async');

const COLLECTION_NAME = 'country';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Config = app.locals.Config;

    const schemaObj = new Schema({
        name: {
            type: String,
            required: true
        },
        code: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        }
    });

    const Country = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Country= Country;
    doneCb();

};
