const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Async = require('async');

const COLLECTION_NAME = 'city';

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
        state_id: {
            type: Number,
            required: true,
        },
        state_code:{
            type: String,
            required: true
        },
        state_name: {
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
        wikiDataId:{
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        }
    });

    schemaObj.index({country_code:1, state_name:1, name:1, status:1});

    const City = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.City= City;
    doneCb();

};
