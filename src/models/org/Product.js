/**
 * @desc Contains Product model definition and its functions
 */
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const Async = require('async');
const Lodash = require('lodash');

const ProductFields     = require('../abstract/ProductFields')();

const COLLECTION_NAME = 'product';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;

    const schemaObj= new Schema({
        ...ProductFields
    });

    schemaObj.methods.getShortForm = function () {
        return {
            _id : this._id,
            name: this.name,
            code: this.code,
            displayName: this.displayName,
            manufacturer: this.manufacturer,
            brand: this.brand
        };
    };

    schemaObj.statics.processInputData = function(by, inputData, cb) {
        let data = {...inputData};
        const ProductCategory= app.locals.models.ProductCategory;

        const loadProductCategory= (next) =>{
            if (!data.categoryId){
                return next();
            }
            ProductCategory.findById(data.categoryId, (err, pc)=>{
                if (err){
                    return next(err);
                }
                if (!pc){
                    return next(`product category with id ${data.categoryId} not found!`);
                }
                data.category = pc.getShortForm();
                delete data.categoryId;
                return next();
            });
        };

        const populateCode = (next)=>{
            if (!app.locals.Settings.product.code){
                data.code= data.category.name +'/'+ data.name.trim();
            }
            return next();
        };

        Async.series([loadProductCategory, populateCode], (err)=>{
            if (err){
                return cb(err);
            }
            return cb(undefined, data);
        });
    }

    schemaObj.pre('validate', function (next){
        const MeterType = app.locals.models.MeterType;

        const populateMeterTypes = (next2) =>{
            if (!this.hasMeters) {
                this.set('meterTypes', undefined);
                return next2();
            }
            if (!this.meterTypes || this.meterTypes.length === 0){
                this.set('meterTypes', undefined);
                return next2();
            }
            let meterTypeIds= [];
            Lodash.forEach(this.meterTypes, function (value) {
                meterTypeIds.push(value._id);
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
        Async.series([populateMeterTypes], next);
    });

    schemaObj.pre('save', function (next) {
        if (this.category && this.category.name){
            this.displayName= [this.category.name, this.name].join('/');
        }
        else {
            this.displayName= this.name;
        }
        if (!this.isNew){
            return next();
        }
        const populateSequenceId = (next2) =>{
            Counter.getNextSequence(COLLECTION_NAME, (err, {seqId, code})=>{
                if (err){
                    console.log(err);
                    return next2('error while getNextSequence!');
                }
                this.seqId= seqId;
                // this.code= code; code comes from input
                next2();
            });
        };
        Async.series([populateSequenceId], next);
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

    const Product = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Product = Product;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {}, (err)=>{
        doneCb(err);
    });

};
