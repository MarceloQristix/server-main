const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Async = require('async');

const Utils = require('../utils');
const CollSchemaShort = Utils.CollSchemaShort;

const COLLECTION_NAME = 'expense';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;

    const schemaObj = new Schema({
        name: { //desc
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
        secondaryCode: {    //In case loading of expense data from another system
            type: String,
            trim: true
        },
        desc :{
            type: String,
            trim: true
        },
        eType: {    //for now this field is auto populated
            type: String,
            default: 'regular'
        },
        incurredOn: {
            type : Date,
            required: true
        },
        refTicket: {...CollSchemaShort},
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let conditions = {};
            conditions = {
                '$or': [
                    {'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')}},
                    {'code': searchStr},
                    {'secondaryCode': searchStr}
                ]
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

    const Expense = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Expense = Expense;

    schemaObj.index({'name': 1});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'secondaryCode': 1}, {unique: true, sparse: true});
    schemaObj.index({'seqId': 1}, {unique: true});
    schemaObj.index({'contact.phoneNumber': 1});
    schemaObj.index({'contact.altPhoneNumber': 1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: 'EXP', padding: 6}, (err) => {
        doneCb(err);
    });

    return;
};
