
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const AbstractItemSchema = require('../abstract/item')();

const Utils = require('../utils');
const Async = require("async");

const COLLECTION_NAME = 'accessory';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;

    const ItemExtraFields = {
        warranty    : { //days - overall warranty
            type    : Number,
        },
        productsCompatible  : [ObjectId],
        modelsCompatible    : [ObjectId],
        tags    : [String]
    };

    const schemaObj= new Schema(Object.assign(ItemExtraFields, AbstractItemSchema));

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
        if (!app.locals.Settings.accessory.code){
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

    const Accessory = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Accessory = Accessory;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix:'ACC', padding:6}, (err)=>{
        doneCb(err);
    });

};
