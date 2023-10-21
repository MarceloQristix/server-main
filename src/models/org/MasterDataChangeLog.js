const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Utils = require('../utils');

const COLLECTION_NAME = 'masterDataChangeLog';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;

    const schemaObj = new Schema({
        name: {
            type: String,   //Master data collection name
            trim: true,
            required: true
        },
        lastUpdatedAt: {
            type: Date,
            default: Date.now
        },
        lastUpdatedBy: {
            type: ObjectId,
        }
    });

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name
        };
    };

    const MasterDataChangeLog = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.MasterDataChangeLog = MasterDataChangeLog;

    schemaObj.index({'name': 1});
    schemaObj.index({'lastUpdated': 1});

    return doneCb();
};
