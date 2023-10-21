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

const COLLECTION_NAME = 'sku';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const CollectionSettings= app.locals.Settings.sku;

    const AdditionalFields= {};
    for (let field of CollectionSettings.Fields||[]){
        AdditionalFields[field.id]= field;
    }

    const schemaObj= new Schema({
        ...ProductFields,
        mType: {
            type: String,
            default: 'product',
            enum: [
                'product',
                'sparePart',
                'consumable',
                'accessory'
            ]
        },
        primaryImage: {
            type: String,
            trim: true
        },
        product: {
            type: String,
            trim: true
        },
        model: {
            type: String,
            trim: true
        },
        variant: {
            type: String,
            trim: true
        },
        brand: {
            type:String,
            trim: true
        },
        manufacturer: {
            type: String,
            trim: true
        },
        additionalField1: {
            type: String,
            trim: true
        },
        attrs: {
            color: {
                type: String
            },
            variant: {
                type: String
            },
            fuelType: {
                type: String
            },
            transmission: {
                type: String
            }
        }
    });

    const formatQuery = function (query) {
        let searchConditions;
        let ids= query.id;
        if (ids){
            if (Array.isArray(ids)){
                if (Array.isArray(ids[0])){
                    ids= ids[0];
                }
                query._id= {$in: Lodash.map(ids, (id)=>{return Mongoose.Types.ObjectId(id)})};
            }
            else {
                query._id = Mongoose.Types.ObjectId(ids);
            }
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
        const MeterType = app.locals.models.MeterType;

        if (this.brand){
            this.displayName= [this.name, this.brand].join(' - ');
        }
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

        const populateSequenceId = (next2) =>{
            if (!this.isNew){
                return next2();
            }
            if (!this.mType){
                this.mType= 'product';
            }
            Counter.getNextSequence(COLLECTION_NAME, (err, {seqId, paddedSeqId})=>{
                if (err){
                    console.log(err);
                    return next2('error while getNextSequence!');
                }
                this.seqId= seqId;
                this.code= (this.mType === 'product')? ('PROD'+paddedSeqId): paddedSeqId;
                next2();
            });
        }

        Async.series([populateSequenceId, populateMeterTypes], next);

    });

    schemaObj.post('save', function (next) {

    });

    const SKUModel = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.SKU = SKUModel;

    SKUModel.syncIndexes();

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {padding:6}, (err)=>{
        doneCb(err);
    });

};
