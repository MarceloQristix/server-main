const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Async = require('async');

const COLLECTION_NAME = 'state';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Config = app.locals.Config;

    const schemaObj = new Schema({
        source_id: {
            type: Number,
            required: true,
            unique: true,
        },
        name: {
            type: String,
            required: true
        },
        state_code: {
            type: String,
            required: true
        },
        country_id: {
            type: Number,
            required: true,
        },
        country_code: {
            type: String,
            required: true
        },
        country_name: {
            type: String,
            required: true
        },
        latitude: {
            type: String,
            required: true
        },
        longitude:{
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        }
    });

    schemaObj.index({country_code:1, name:1, status:1});

    const State = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.State= State;
    doneCb();

};
