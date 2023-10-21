const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Validator = require('validator');
const Async = require('async');

const COLLECTION_NAME = 'service';

let servicesToUpdatePrice = {};

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const STYPE = {
        SUPPORT         : 'support',    //breakdown
        PM              : 'pm',
        INSTALLATION    : 'installation',
        INSPECTION      : 'inspection',
        COMMISSIONING   : 'commissioning',
        CONSUMABLE_REQ  : 'consumable_req'
    };

    const schemaObj = new Schema({
        name: {
            type            : String,
            trim            : true,
            required        : true
        },
        ticketType: {
            type            : String,
            enum            : Object.values(STYPE)
        }        
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let conditions = {};
            conditions = {
                '$or': [
                    {'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')}},                        
                    {'ticketType': searchStr}
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

    schemaObj.post('save', function (doc,next) {
        const RateCard = app.locals.models.RateCard;

        const updateRateCards = next2 => {
            RateCard.find({ },{},(err,record) => {
                if(err) return next2(err);
                if(!record) return next2('No rate-cards found');
                
                record.forEach(item => {
                    item.prices = item.prices || [];
                    item.prices.push({
                        service: doc.getShortForm(),
                        price: servicesToUpdatePrice[doc.name]?.[item.id]
                    })
                    item.save();
                });
                delete servicesToUpdatePrice[doc.name];
                
                return next2();
            });
        };
        
        if(servicesToUpdatePrice[doc.name]) {
            Async.series([ updateRateCards ],(err) => {
                return next();
            });
        } else {
            next();
        }
    });

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name,
            ticketType: this.ticketType
        };
    };

    schemaObj.statics.processInputData = function(by,inputData,cb) {
        let data = { ...inputData };
        servicesToUpdatePrice[data.name] = data.ratecard;
        cb(null,data);
    };

    const Service = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Service = Service;

    schemaObj.index({'name': 1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: 'SERVICE', padding: 4}, (err) => {
        doneCb(err);
    });

    return;
};
