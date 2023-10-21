/**
 * @desc Contains Product category definition
 */
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Utils = require('../utils');
const Async = require("async");
const Lodash = require("lodash");
const CollSchemaShort= Utils.CollSchemaShort;

const COLLECTION_NAME = 'product_category';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;

    const schemaObj= new Schema({
        name        : {
            type    : String,
            required: true,
            unique  : true
        },
        code        : {
            type    : String,
            unique  : true
        },
        seqId       :{
            type    : Number,
            unique  : true
        },
        rateCard    : { 
            code    : {type: String},
            name    : {type: String}
        },
        parent      : {...CollSchemaShort}, //TODO: need to implement
        children    : [{...CollSchemaShort}]    //TODO: need to impement
    });

    const formatQuery = function (query) {
        let searchConditions;
        if (query.id){
            query._id= [];
            Lodash.forEach(query.id, function (value) {
                query._id.push(value);
            });
            delete query.id;
        }
        if (query.q) {
            let searchStr= query.q;
            let conditions= {};
            let regexp= {$regex: new RegExp('.*'+searchStr+'.*', 'i')};
            conditions={
                '$or': [
                    {'name': regexp},
                    {'code': searchStr},
                    {'secondaryCode': searchStr},
                    {'displayName': regexp}
                ]
            }
            delete query.q;
            searchConditions = {...conditions};    //While searching other filters are purposefully ignored
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
        if (!this.isNew){
            return next();
        }
        Counter.getNextSequence(COLLECTION_NAME, (err, {code, seqId})=>{
            if (err){
                console.log(err);
                return next('error while getNextSequence!');
            }
            this.code= code;
            this.seqId= seqId;
            next();
        });
    });

    const ProductCategory = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.ProductCategory = ProductCategory;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix:'PC', padding:4}, (err)=> {
        doneCb(err);
    });

};
