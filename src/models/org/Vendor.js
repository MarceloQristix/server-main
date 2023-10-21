const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Validator = require('validator');
const Async = require('async');

const Utils = require('../utils');
const CollSchemaShort = Utils.CollSchemaShort;
const AddressSchema = Utils.AddressSchema;
const ContactSchema = Utils.ContactSchema;

const COLLECTION_NAME = 'vendor';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;

    const schemaObj = new Schema({
        name: {
            type: String,
            trim: true,
            required: true
        },
        code: {
            type: String,
        },
        seqId: {
            type: Number
        },
        secondaryCode: {
            type: String,
            trim: true
        },
        address: {...AddressSchema},
        contact: {...ContactSchema},
        gstin: { type: String }
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let conditions = {};
            if (Validator.isMobilePhone(searchStr)) {
                conditions = {
                    '$or': [
                        {'contact.phoneNumber': searchStr},
                        {'contact.altPhoneNumber': searchStr}
                    ]
                };
            } else {
                conditions = {
                    '$or': [
                        {'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')}},
                        {'code': searchStr},
                        {'secondaryCode': searchStr}
                    ]
                }
            }
            delete query.q;
            query = {...conditions};
        }
        if (query.excludeIds) {
            query._id = {
                $nin: Lodash.map(query.excludeIds, (id) => {
                    return Mongoose.Types.ObjectId(id)
                })
            };
            delete query.excludeIds;
        }
        return query;
    };

    schemaObj.pre('find', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('count', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('countDocuments', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('save', function (next) {
        if (!this.isNew) {
            return next();
        }
        Counter.getNextSequence(COLLECTION_NAME, (err, {code, seqId}) => {
            if (err) {
                console.log(err);
                return next('error while getNextSequence!');
            }
            this.code = code;
            this.seqId = seqId;
            next();
        });
    });

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name,
            code: this.code,
            secondaryCode: this.secondaryCode
        };
    };

    const Vendor = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Vendor = Vendor;

    schemaObj.index({'name': 1});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'secondaryCode': 1}, {unique: true, sparse: true});
    schemaObj.index({'seqId': 1}, {unique: true});
    schemaObj.index({'contact.phoneNumber': 1});
    schemaObj.index({'contact.altPhoneNumber': 1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: 'VENDOR', padding: 4}, (err) => {
        doneCb(err);
    });

    return;
};
