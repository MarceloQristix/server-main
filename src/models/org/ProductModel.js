/**
 * @desc Contains SKU
 */
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const ProductFields     = require('../abstract/ProductFields')();

const Utils = require('../utils');
const Async = require("async");
const Lodash = require("lodash");
const Validator = require("validator");
const CollSchemaShort= Utils.CollSchemaShort;

const COLLECTION_NAME = 'productModel';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;

    const schemaObj= new Schema({
        ...ProductFields,
        product : {...CollSchemaShort, brand: {type:String}, manufacturer: {type: String}},
        isMeterTypesSameAsInProduct  : {type: Boolean}
    });

    schemaObj.statics.processInputData = function(by, inputData, cb) {
        let data = {...inputData};
        const Product= app.locals.models.Product;

        const loadProduct= (next) =>{
            if (!data.productId){
                return next();
            }
            Product.findById(data.productId, (err, product)=>{
                if (err){
                    return next(err);
                }
                if (!product){
                    return next(`product with id ${data.productId} not found!`);
                }
                data.product = product.getShortForm();
                if (product.category){
                    data.category= {...product.category}
                }
                delete data.productId;
                return next();
            });
        };

        const populateCode = (next)=>{
            if (!app.locals.Settings.model.code){
                data.code= data.product.code +'/'+ data.name.trim();
            }
            return next();
        };

        Async.series([loadProduct, populateCode], (err)=>{
            if (err){
                return cb(err);
            }
            return cb(undefined, data);
        });
    }

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
        if(query.productId) {
            query['product._id']= Mongoose.Types.ObjectId(query.productId);
            delete query.productId;
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
        const MeterType = app.locals.models.MeterType;
        const Product = app.locals.models.Product;
        let product= undefined;

        const populateProductShortForm = (next2) =>{
            Product.findById(this.product._id, (err, record)=>{
                if (err){
                    return next2(err);
                }
                if (!record){
                    return next2('reference product not found!');
                }
                product = record;
                this.set('product', product.getShortForm());
                this.markModified('product');
                if (product.category){
                    this.category= {...product.category}
                    this.markModified('category');
                }
                this.displayName= [this.product.displayName|| this.product.name, this.name].join('/');
                return next2();
            });
        };

        const populateMeterTypes = (next2) =>{
            if (!this.hasMeters) {
                this.set('meterTypes', undefined);
                return next2();
            }
            if (this.isMeterTypesSameAsInProduct) {
                if (!product.hasMeters){
                    this.set('meterTypes', undefined);
                    return next2();
                }
                if (!product.meterTypes) {
                    this.set('meterTypes', undefined);
                    return next2();
                }
                this.meterTypes = [...product.meterTypes];
                this.markModified('meterTypes');
                return next2();
            }
            if (!this.meterTypes || this.meterTypes.length === 0){
                this.set('meterTypes', undefined);
                return next2();
            }
            let meterTypeIds= [];
            Lodash.forEach(this.meterTypes, function (value) {
                if (typeof (value) === 'string'){
                    meterTypeIds.push(value);
                }
                else {
                    meterTypeIds.push(value._id||value.id);
                }
            });
            MeterType.find({_id: {$in:meterTypeIds}}, (err, meterTypes)=>{
                if (err){
                    return next2(err);
                }
                this.meterTypes= [];
                for (let index = 0; index < meterTypes.length; index++){
                    this.meterTypes.push(meterTypes[index].getShortForm());
                }
                this.markModified('meterTypes');
                next2();
            });
        };

        const populateSequenceId = (next2) =>{
            if (!this.isNew){
                return next2();
            }
            Counter.getNextSequence(COLLECTION_NAME, (err, {seqId})=>{
                if (err){
                    console.log(err);
                    return next2('error while getNextSequence!');
                }
                this.seqId= seqId;
                next2();
            });
        }

        Async.series([populateSequenceId, populateProductShortForm, populateMeterTypes], next);

    });

    schemaObj.post('save', function (next) {
        const Asset = app.locals.models.Asset;

        const doSync = (Model, next2) => {
            Model.sync(COLLECTION_NAME, this, next2);
        };

        Async.eachSeries([Asset], doSync, next);
    });

    schemaObj.methods.getShortForm = function () {
        return {
            _id : this._id,
            name: this.name,
            code: this.code,
            product: this.product,
        };
    };
    //FIXME: add sync logic for product, meter types

    schemaObj.statics.sync = function(coll, dupRecord, cb) {
        let cond= {}, updateValues= {};
        if (coll === 'product') {
            cond['product._id']= dupRecord._id;
            updateValues= {
                product: {...dupRecord.getShortForm()}
            };
            this.updateMany(cond, {$set:updateValues}, {}, cb);
        }
    };


    const ProductModel = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.ProductModel = ProductModel;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {}, (err)=>{
        doneCb(err);
    });

};
