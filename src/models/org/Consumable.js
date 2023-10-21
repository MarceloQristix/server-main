
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const SpareFields     = require('../abstract/SpareFields')();

const Utils = require('../utils');
const Async = require("async");
const Lodash = require("lodash");

const COLLECTION_NAME = 'consumable';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;

    let ConsumableFields= {...SpareFields};
    ConsumableFields.warranty.required= false;
    const schemaObj= new Schema(ConsumableFields);

    const formatQuery = function (query) {
        let searchConditions;
        if (query.q) {
            let searchStr= query.q;
            let conditions= {};
            let regexp= {$regex: new RegExp('.*'+searchStr+'.*', 'i')};
            conditions={
                '$or': [
                    {'name': regexp},
                    {'code': searchStr}
                ]
            }
            delete query.q;
            searchConditions = {...conditions};    //While searching other filters are purposefully ignored
        }
        if(query.productId) {
            // query['product._id']= Mongoose.Types.ObjectId(query.productId);
            delete query.productId;
        }
        if(query.modelId) {
            // query['model._id']= Mongoose.Types.ObjectId(query.modelId);
            delete query.modelId;
        }
        if (searchConditions){
            query= {...query, ...searchConditions};
        }
        let ids= query.id;
        if (ids){
            if (Array.isArray(ids)){
                query._id= {$in: Lodash.map(ids, (id)=>{return Mongoose.Types.ObjectId(id)})};
            }
            else {
                query._id = Mongoose.Types.ObjectId(ids);
            }
            delete query.id;
        }
        return query;
    };

    schemaObj.pre('find', function() {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('count', function() {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('countDocuments', function() {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('save', function (next) {
        this.mType= 'consumable';
        if (!app.locals.Settings.consumable.code){
            this.code= this.name;
        }
        if (!this.isNew){
            return next();
        }
        Counter.getNextSequence(COLLECTION_NAME, (err, {seqId})=>{
            if (err){
                console.log(err);
                return next('error while getNextSequence!');
            }
            this.seqId= seqId;
            next();
        });
    });


    const Consumable = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Consumable = Consumable;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix:'CONS', padding:6}, (err)=>{
        doneCb(err);
    });

};
