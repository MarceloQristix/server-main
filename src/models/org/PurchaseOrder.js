const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Utils = require('../utils');
const Async = require("async");
const Moment = require("moment");
const ES6Template = require('es6-template-string');
const AddressSchema = Utils.AddressSchema;

const COLLECTION_NAME = 'purchaseOrder';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const Settings= app.locals.Settings;
    const CollectionSettings= Settings.purchaseOrder;
    const SEQ_CODE_START= CollectionSettings.seqCodeStart||0;
    const SEQ_CODE_PREFIX= CollectionSettings.seqCodePrefix;
    const SEQ_CODE_PADDING= CollectionSettings.seqCodePadding;

    const schemaObj = new Schema({
        name: {
            type: String,
            unique: true,
        },
        code: {
            type: String,
            unique: true
        },
        year: { //2 digits of the year from poDate
            type: Number,
        },
        seqId: {
            type: Number,
        },
        referenceNumber: {
            type: String
        },
        poDate: {   //user input
            type: Date,
            required: true
        },
        deliverByDate: {
            type: Date,
            required: true
        },
        deliverTo: {    //Name of the person/Company to deliver to
            type: String,
            required: true
        },
        deliveryAddress : {...AddressSchema},
        vendorId: {
            type: ObjectId,
            required: true
        },
        items: [{
            _id: ObjectId,
            name: String,
            code: String,
            desc: String,
            mType: String,
            quantity: Number,
            price: Number,
            amount: Number,
            uom: String
        }],
        totalAmount: {
            type: Number
        },
        numItems: { //populated during pre save
            type: Number
        },
        termsAndConditions: {
            type: String
        }
        // status: {
        //     type: String,
        //     default: 'open',
        //     enum: ['open','cancelled']
        // }
    });

    schemaObj.statics.processInputData = function(by, inputData, cb) {
        let data = {...inputData};
        const processItems= (next)=>{
            let items= [];
            let totalAmount= 0;
            data.items.forEach((item)=>{
                item._id= Mongoose.Types.ObjectId(item._id||item.id);
                if (item.price && item.quantity){
                        item.amount= item.price* item.quantity;
                    totalAmount += item.amount;
                }
                items.push(item);
            });
            data.items= [...items];
            data.totalAmount= totalAmount;
            return next();
        };
        Async.series([processItems], (err)=>{
            if (err){
                return cb(err);
            }
            return cb(undefined, data);
        });
    };

    schemaObj.virtual('totalAmountInWords').get(function() {
        return app.locals.services.ToWords.convert(this.totalAmount, {currency:true});
    });

    schemaObj.virtual('vendor', {
        ref: 'vendor', // The model to use
        localField: 'vendorId', // Find people where `localField`
        foreignField: '_id', // is equal to `foreignField`
        justOne : true
        // count: true // And only get the number of docs
    });

    const formatQuery = function (query) {
        let searchConditions;
        if (query.q) {
            let searchStr= query.q;
            let conditions= {};
            let regexp= {$regex: new RegExp('.*'+searchStr+'.*', 'i')};
            conditions={
                '$or': [
                    {'code': searchStr},
                    {'name': searchStr}
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
        this.numItems= this.items.length;
        const populateCode= (next2)=>{
            if (!this.isNew){
                return next2();
            }
            Counter.getNextSequence(COLLECTION_NAME, (err, {seqId, code, paddedSeqId})=>{
                if (err){
                    console.log(err);
                    return next2('error while getNextSequence!');
                }
                this.seqId= seqId;
                let year= Moment(this.poDate).format('yy');
                this.year= year;
                this.code= SEQ_CODE_PREFIX+ ES6Template(CollectionSettings.codeTemplate, {year, paddedSeqId});
                this.name= code;
                next2();
            });
        };

        const populateDerivedFields= (next2) =>{
            this.totalAmount= 0;
            this.items.forEach((item)=>{
                this.totalAmount += item.price * item.quantity;
            });
            return next2();
        };

        Async.series([populateCode, populateDerivedFields], next)
    });

    schemaObj.statics.QFindById= function (id) {
        return new Promise((resolve, reject) => {
            PurchaseOrder.findById(id).populate('vendor')
                .then((doc) => {
                    resolve(doc);
                })
                .catch((err) => {
                    reject(err);
                });
        });
    };

    const PurchaseOrder = Db.model(COLLECTION_NAME, schemaObj);

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});
    schemaObj.index({'vendorId': 1});
    schemaObj.index({'code': 1}, {unique:true});

    app.locals.models.PurchaseOrder = PurchaseOrder;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(
        sysUser._id,
        COLLECTION_NAME,
        SEQ_CODE_START,
        {prefix: SEQ_CODE_PREFIX, padding:SEQ_CODE_PADDING},
        (err)=>{
            doneCb(err);
        }
    );

};
