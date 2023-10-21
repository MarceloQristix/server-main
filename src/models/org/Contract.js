const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Async = require('async');
const Lodash = require('lodash');
const Moment = require("moment");

const Utils = require('../utils');
const Validator = require("validator");
const AbstractTicket = require("../abstract/Ticket");
const CollSchemaShort= Utils.CollSchemaShort;
const ContactSchema = Utils.ContactSchema;
const TICKET_STATUS= AbstractTicket.TICKET_STATUS;

const CONTRACT_STATUS = require('../../const/contractStatus');

const EXPIRY_TYPES = {
    METER_BASED     : '01_meter_based',
    TIME_BASED      : '02_time_based',
    WHICHEVER_EARLY : '03_early_target',
    WHICHEVER_LATER : '04_later_target'
};

const INTERVAL_DAYS = {
    '1': 7,
    '2': 14,
    '3': 30,
    '4': 90,
    '5': 180,
    '6': 45
};

const PARALLEL_LIMIT = 5;
/*
    { id: '1', name: 'Weekly' },
    { id: '2', name: 'FortNightly' },
    { id: '3', name: 'Monthly' },
    { id: '4', name: 'Quarterly' },
    { id: '5', name: 'Half Yearly' },
*/
const COLLECTION_NAME = 'contract';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const CONTRACT_TYPES = Utils.getIds(Settings.contract.types);
    const hasMeters= Settings.product.hasMeters;

    const opts = { toJSON: { virtuals: true } };

    const schemaObj = new Schema({
        name        : { //can be type+customer name etc
            type    : String,
            required: true,
            index   : true
        },
        product     : { ...CollSchemaShort},
        model       : {
            ...CollSchemaShort,
            meterTypes: {
                type: [{...CollSchemaShort}]
            }
        },
        sku         : {
            ...CollSchemaShort,
            product : {type : String},
            model   : {type : String}
        },
        code        : {
            type    : String,
            unique  : true
        },
        seqId       : {
            type    : Number,
            unique  : true
        },
        cType       : { //AMC, Warranty etc
            type    : String,
            required: true,
            default :'amc', //FIXME: need to remove this later
            enum    : CONTRACT_TYPES
        },
        referenceNumber: { //Refers to either p.o number or quotation number
            type    : String
        },

        duration    : { //in days
            type    : Number,
            required: true
        },
        startDate   : { //startOfDay
            type    : Date,
            required: true
        },
        endDate     : { //filled based on the duration and startDate
            type    : Date, //endOfDay
            required: true
        },
        expiryType : {
            type    : String,
            required: true,
            enum    : Object.values(EXPIRY_TYPES)
        },

        status      : {
            type    : String,
            default : CONTRACT_STATUS.DRAFT,
            enum    : Object.values(CONTRACT_STATUS)
        },

        customer    : {
            ...CollSchemaShort,
            address: {...Utils.AddressSchema},
        },
        contact     : {...ContactSchema},

        parent      : {...CollSchemaShort},

        attachment  : {type:Schema.Types.Mixed},

        sourceContract: {...CollSchemaShort},   //renewed From
        renewedContract:  {...CollSchemaShort}, //renewed to

        assets      : [{
            ...CollSchemaShort,
            secondaryCode: String,
            serialNumber: String,
            secondarySerialNumber: String,
            extraCode1: String,
            extraCode2: String,
            model: {...CollSchemaShort},
            locatedAt: String,
            contract: {...CollSchemaShort},
            purchaseCost: Number,
            isCritical: Boolean,
            initialMeterReadings:[{...CollSchemaShort, reading: Number}]
        }],
        totalAssetsValue: {type: Number},

        numAssets   : {
            type    : Number,
            default : 0
        },

        freeSpareParts  : [ {...CollSchemaShort, quantity: Number}],
        freeConsumables : [ {...CollSchemaShort, quantity: Number}],

        chargeableServices: [{ ...CollSchemaShort, quantity: Number }],
        chargeableSpareParts: [{ ...CollSchemaShort, quantity: Number }],
        chargeableConsumables: [{ ...CollSchemaShort, quantity: Number }],

        counters :{ //consumables count, spares count, services count across all assets
            services: {},
            consumables: {},
            spares: {}
        },

        meterLimits     : [{...CollSchemaShort, limit: Number}],
        charges     : {
            planType    : {
                type: String,
                enum : ['fixed', 'hybrid']
            },
            amount      : { type: Number},
            meterCharges: [
                {
                    ...CollSchemaShort,    //Reference to  MeterType
                    limit: Number,
                    perUnitPriceTillLimit: Number,
                    perUnitPriceAboveLimit: Number
                }
            ]
        },
        sla         : {
            tat         : Number,   //hours
            responseTime: Number,    //hours
            pm      : {
                frequency   : Number,   //number of pm calls
                interval    : Number,   //days -- not used now
                startsAfter : Number, //days
            }
        },
        version: {type: Number, default:0},
        discounts   :{
            serviceCharge: {type: Number, default:0},   //applicable on all service charges
            spares: {type: Number, default:0},
            consumables: {type: Number, default:0}
        },

        /**
         * @desc - primary org unit to which the customer is mapped based on
         * location typically
         */
        orgUnit     : {
            ...CollSchemaShort,
            ancestorOrgUnitIds  : [ObjectId]
        },
        pmSchedule : [Date],
        scheduleDayPreference : {
            dayOfTheWeek    : {type : Number},  //0 - Mon , 1 - Tue
            dayOfTheMonth   : {type : Number},
        }
    }, opts);

    const formatQuery = function (query) {
        let searchConditions;
        if (query.q) {
            let searchStr= query.q;
            let regExp= {$regex: new RegExp('.*' + searchStr + '.*', 'i')};
            let conditions= {};
            if (Validator.isMobilePhone(searchStr)){
                conditions= {
                    '$or':[
                        {'contact.phoneNumber': searchStr },
                        {'contact.altPhoneNumber': searchStr}
                    ]
                };
            }
            else {
                const seqId = Number(searchStr);
                if (seqId) {
                    conditions = {
                        '$or': [
                            {'secondaryCode': searchStr},
                            {'seqId': seqId},
                            { 'assets.serialNumber': searchStr }
                        ]
                    }
                }
                else {
                    conditions = {
                        '$or': [
                            {'name': regExp},
                            {'code': searchStr},
                            {'secondaryCode': searchStr},
                            { 'assets.serialNumber': searchStr },
                            {referenceNumber: regExp}
                        ]
                    }
                }
            }
            delete query.q;
            searchConditions= {...conditions};
        }
        if (query.customerId) {
            query['customer._id']= Mongoose.Types.ObjectId(query.customerId);
            delete query.customerId;
        }
        if (query.assetId) {
            query['assets._id']= {$in: [Mongoose.Types.ObjectId(query.assetId)]};
            delete query.assetId;
        }
        if (query.parentId){
            query['parent._id']= Mongoose.Types.ObjectId(query.parentId);
            delete query.parentId;
        }
        if (query.cType === 'nonWarranty'){
            query.cType = {$ne: 'warranty'}
        }
        if (query.expiry === 'next15Days'){
            query.status= '03_active';
            query.endDate= {$lte: Moment().add(15,'days').toDate()};
            delete query.expiry;
        }

        if (searchConditions){
            query= {...query, ...searchConditions}
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

    const Months= {
        "Jan": {
            "name": "January",
            "short": "Jan",
            "number": 1,
            "days": 31
        },
        "Feb": {
            "name": "February",
            "short": "Feb",
            "number": 2,
            "days": 28
        },
        "Mar": {
            "name": "March",
            "short": "Mar",
            "number": 3,
            "days": 31
        },
        "Apr": {
            "name": "April",
            "short": "Apr",
            "number": 4,
            "days": 30
        },
        "May": {
            "name": "May",
            "short": "May",
            "number": 5,
            "days": 31
        },
        "Jun": {
            "name": "June",
            "short": "Jun",
            "number": 6,
            "days": 30
        },
        "Jul": {
            "name": "July",
            "short": "Jul",
            "number": 7,
            "days": 31
        },
        "Aug": {
            "name": "August",
            "short": "Aug",
            "number": 8,
            "days": 31
        },
        "Sep": {
            "name": "September",
            "short": "Sep",
            "number": 9,
            "days": 30
        },
        "Oct": {
            "name": "October",
            "short": "Oct",
            "number": 10,
            "days": 31
        },
        "Nov": {
            "name": "November",
            "short": "Nov",
            "number": 11,
            "days": 30
        },
        "Dec": {
            "name": "December",
            "short": "Dec",
            "number": 12,
            "days": 31
        }
    }
    const MaxDaysMonthWise= [];
    for (let month in Months){
        MaxDaysMonthWise.push(Months[month].days);
    }

    schemaObj.method('populatePMSchedule', function(){
        const { frequency, startsAfter } = this.sla.pm;
        const startDate= this.startDate;
        const duration= this.duration;
        let dueDates = [];
        let gap = Math.round((duration - startsAfter)/frequency);
        dueDates[0] = Moment(startDate).startOf('day').add(startsAfter,'d');
        let dayOfTheMonth= (this.scheduleDayPreference?.dayOfTheMonth)||0;
        if (dayOfTheMonth>0){
            let maxDays= MaxDaysMonthWise[dueDates[0].month()];
            if (dayOfTheMonth <= maxDays){
                dueDates[0]= dueDates[0].date(dayOfTheMonth);
            }
        }
        dueDates[0]= dueDates[0].toDate();
        for(let i = 1; i < frequency; i++){
            dueDates[i] = Moment(dueDates[i-1]).add(gap,'d');
            if (dayOfTheMonth>0){
                let maxDays= MaxDaysMonthWise[dueDates[i].month()];
                if (dayOfTheMonth <= maxDays){
                    dueDates[i]= dueDates[i].date(dayOfTheMonth);
                }
            }
            dueDates[i]= dueDates[i].toDate();
        }
        this.pmSchedule= dueDates;
        this.markModified('pmSchedule');
    });

    schemaObj.pre('save', function (next) {
        this.$locals.wasNew = this.isNew;

        let startDateVal = Moment(this.startDate).toDate().valueOf();
        let endDateVal = Moment(this.endDate).toDate().valueOf();
        let todayDateVal = Moment().toDate().valueOf();
        this.populatePMSchedule();

        let newStatus= this.status;
        const computeStatus = (next2) =>{
            if ([CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.DRAFT].indexOf(this.status)!== -1){
                if (endDateVal <todayDateVal){
                    newStatus= CONTRACT_STATUS.EXPIRED;
                }
                else if ( startDateVal <= todayDateVal ){
                    newStatus= CONTRACT_STATUS.ACTIVE;
                }

                if (startDateVal > todayDateVal){   //Contract yet to start
                    newStatus= CONTRACT_STATUS.DRAFT;
                }
            }
            this.status= newStatus;
            return next2();
        };

        let updateAssetInformation = (next2) => {
            const Asset= app.locals.models.Asset;
            let assetIds = Lodash.map(this.assets, '_id');
            Asset.find({_id:{$in:assetIds}}, {}, (err, assets)=>{
                if (err){
                    return next2();
                }
                if (this.status !== CONTRACT_STATUS.EXPIRED){
                    let assetMap= {};
                    assets.forEach((asset)=>{
                        assetMap[asset._id.toString()]= asset;
                    });
                    this.assets.forEach((asset)=>{
                        let sf= assetMap[asset._id.toString()]?.getShortForm();
                        if (!sf){
                            console.log('Did not find asset in the contract ... FATAL!!');
                            return;
                        }
                        for (let key in sf){
                            asset[key]= sf[key];
                        }
                    });
                    this.markModified('assets');
                    return next2();
                }
                const detachContract= (asset, next2) =>{
                    asset.detachContract(this.lastModifiedBy, this, next2);
                };
                Async.eachSeries(assets, detachContract, next2);
            });
        }

        const assignCode = (next2) => {
            if (this.code){ //code is prefilled
                return next2();
            }
            Counter.getNextSequence(COLLECTION_NAME, (err, {code, seqId})=>{
                if (err){
                    console.log(err);
                    return next2('error while getNextSequence!');
                }
                this.code= code;
                this.seqId= seqId;
                next2();
            });
        };

        Async.series([computeStatus, updateAssetInformation, assignCode], next);
    });

    schemaObj.virtual('isDue4Renewal').get(function() {
        if (this.renewedContract?._id){ //already renewed
            return false;
        }
        if (this.status === CONTRACT_STATUS.DRAFT || this.status === CONTRACT_STATUS.CANCELLED){
            return false;
        }
        // if ((this.status === CONTRACT_STATUS.EXPIRED) || (Moment(this.endDate).diff(new Date(), 'day') <= 30)){
        if (Moment(this.endDate).diff(new Date(), 'day') <= 15){
            return true;
        }
        return false;
    });

    schemaObj.post('save', function(doc, next) {
        if (!this.sourceContract?._id){
            return next();
        }
        return next();
        let Contract = app.locals.models.Contract;
        Contract.findById(this.sourceContract._id, (err, sourceContract) => {
            if(err) {
                console.log("Error finding original contract, " + err);
                return;
            }
            if (!sourceContract){
                console.log('source contract not found !', this.sourceContract.code);
                return;
            }
            sourceContract.renewedContract = this.getShortForm();
            sourceContract.markModified('renewedContract');
            sourceContract.save(next);
        });
    });

    schemaObj.statics.sync= function(coll, dupRecord, cb) {
        let cond= {};
        let updateValues= {};
        if (coll === 'customer') {
            cond['customer._id']= dupRecord._id;
            updateValues= {
                customer: dupRecord.getShortForm()
            };
            this.updateMany(cond, {$set:updateValues}, {}, cb);
        }
        else if (coll === 'asset') {
            cond['asset._id']= dupRecord._id;
            this.findOne(cond, {}, (err, record)=>{
                if (err){
                    return cb();
                }
                if (!record){
                    return cb();
                }
                let index= Lodash.findIndex(record.assets, {_id:dupRecord._id});
                let initialMeterReadings= record.assets[index].initialMeterReadings;
                record.assets[index]= dupRecord.getShortForm();
                record.assets[index].initialMeterReadings= initialMeterReadings;
                record.markModified('assets');
                record.save(cb);
            });
        }
        else if (coll === "meter_type"){
            //FIXME: need to implement updates on
            cb();
        }
    };

    schemaObj.methods.getShortForm = function () {
        return {
            _id : this._id,
            name: this.name,
            code: this.code,
            secondaryCode: this.secondaryCode,
            status: this.status,
            startDate: this.startDate,
            endDate: this.endDate,
            cType: this.cType
        };
    };

    schemaObj.statics.processInputData = function(by, inputData, cb) {
        let data = {...inputData}, meterTypes = [], productId = null;
        let productIds = [];
        if (!data.modelId){
            data.modelId= data.assets[0].model._id;
        }

        const Customer = app.locals.models.Customer;
        const ProductModel = app.locals.models.ProductModel;
        const MeterType = app.locals.models.MeterType;
        const SparePart = app.locals.models.SparePart;
        const Consumable = app.locals.models.Consumable;
        const Asset = app.locals.models.Asset;
        const Product = app.locals.models.Product;

        const exitF = (err) => {
            if (data.assets){
                data.numAssets = data.assets.length;
            }
            console.log("done with processing", err, data);
            return cb(err, data);
        };

        const loadCustomer = (next) => {
            if (!data.customerId) {
                return next();
            }
            Customer.findById(data.customerId, (err, customer) => {
                if (err) {
                    return next(err);
                }
                if (!customer) {
                    return next('customer not found ');
                }
                delete data.customerId;
                data.customer = customer.getShortForm();
                data.contact = customer.contact ? {...customer.contact} : undefined;
                return next();
            });
        };

        const loadProductModel = (next) => {
            if (!data.modelId) {
                return next();
            }
            ProductModel.findById(data.modelId, (err, model) => {
                if (err) {
                    return next(err);
                }
                if (!model) {
                    return next('model not found ');
                }
                delete data.productId;
                delete data.modelId;
                // data.product = {...model.product};
                productId = model.product._id;
                data.model = model.getShortForm();
                let meterTypeIds = Lodash.map(model.meterTypes, '_id');
                MeterType.find({_id: {$in: meterTypeIds}}, {}, (err, records) => {
                    if (err) {
                        return next(err);
                    }
                    meterTypes = Lodash.map(records, (record) => {
                        return record.getShortForm();
                    });
                    data.model.meterTypes = meterTypes;
                    return next();
                });
            });
        };

        const loadProduct = next => {
            if(!productId) return next();
            Product.findById(productId, (err,doc) => {
                if(err) return next(err);
                if(!doc) return next('Product Not Found');
                data.product = doc.getShortForm();
                return next();
            })
        }

        //All assets are from same product model
        const loadAssets = (next) => {
            if (!data.assets || !data.assets.length) {
                return next();
            }
            let initialMeterReadingsByAssetId = {};
            let assetIds= [];
            let hasMeterReadings= false;
            if (!data.assets[0].id){
                assetIds= data.assets;
            }
            else {
                assetIds = Lodash.map(data.assets, (asset) => {
                    initialMeterReadingsByAssetId[asset.id] = asset.initialMeterReadings;
                    return Mongoose.Types.ObjectId(asset.id);
                });
                hasMeterReadings= hasMeters;
            }

            Asset.find({_id: {$in: assetIds}}, {}, (err, records) => {
                if (err) {
                    return next(err);
                }
                data.assets = [];
                const prepareAssetData= (record, next2) =>{
                    let asset = record.getShortForm();
                    asset.serialNumber = record.serialNumber;
                    data.assets.push(asset);
                    if (!hasMeterReadings){
                        return next2();
                    }
                    let meterReadings = initialMeterReadingsByAssetId[asset._id.toString()];
                    let meterReadingsByTypeId = {};
                    Lodash.map(meterReadings, (mr) => {
                        meterReadingsByTypeId[mr.id] = mr.reading;
                        return;
                    });
                    asset.initialMeterReadings = Lodash.map(meterTypes, (mt) => {
                        return {...mt, reading: meterReadingsByTypeId[mt._id.toString()]};
                    });
                    record.noteMeterReadings(by,[...asset.initialMeterReadings], undefined, undefined, (err)=>{
                        if (err){
                            return next2(err);
                        }
                        return next2();
                    });
                };
                Async.eachSeries(records, prepareAssetData, next);
            });
        };

        const typeCastDates = (next) => {
            if (data.startDate) {
                data.startDate = new Date(data.startDate);
            }
            if (data.endDate) {
                data.endDate = new Date(data.endDate);
            }
            return next();
        };

        const loadChargeableSpares = next => {
            if(!data.chargeableSpareParts) {
                return next();
            }
            let sparePartIds = [];
            Lodash.map(
                data.chargeableSpareParts,
                spare => {
                    if (spare) {
                        sparePartIds.push(Mongoose.Types.ObjectId(spare.id));
                    }
                }
            );
            if (sparePartIds.length === 0 ){
                delete data.chargeableSpareParts;
                return next();
            }
            SparePart.find({ _id: { $in: sparePartIds }},{}, (err,records) => {
                if(err) return next(err);
                data.chargeableSpareParts = Lodash.map(records, doc => doc.getShortForm());
                return next();
            })
        };

        const loadFreeConsumables = (next) => {
            if (!data.freeConsumables) {
                return next();
            }
            let consumableQuantityById = {};
            let consumableIds = Lodash.map(data.freeConsumables, (c) => {
                consumableQuantityById[c.id] = c.quantity;
                return Mongoose.Types.ObjectId(c.id);
            });

            Consumable.find({_id: {$in: consumableIds}}, {}, (err, records) => {
                if (err) {
                    return next(err);
                }
                data.freeConsumables = Lodash.map(records, (record) => {
                    return {
                        ...record.getShortForm(),
                        quantity: consumableQuantityById[record._id.toString()]
                    };
                });
                return next();
            });
        };

        const loadMeterLimits = (next) => {
            if (!data.meterLimits) {
                return next();
            }
            let meterLimitsById = {};
            //Lodash.map(data.charges.meterLimits, (ml) => {
            Lodash.map(data.meterLimits, (ml) => {
                meterLimitsById[ml.id] = {...ml};
                delete meterLimitsById[ml.id].id;
            });
            data.meterLimits = Lodash.map(meterTypes, (mt) => {
                return {
                    ...mt,
                    ...meterLimitsById[mt._id.toString()]
                };
            });
            return next();
        };

        const loadMeterCharges = (next) => {
            if (!data.charges || !data.charges.meterCharges) {
                return next();
            }
            let meterChargesById = {};
            Lodash.map(data.charges.meterCharges, (mc) => {
                meterChargesById[mc.id] = {...mc};
                delete meterChargesById[mc.id].id;
            });
            data.charges.meterCharges = Lodash.map(meterTypes, (mt) => {
                return {
                    ...mt,
                    ...meterChargesById[mt._id.toString()]
                }
            });
            return next();
        };

        const loadSourceContract= (next) =>{
            if (!data.sourceContract){
                return next();
            }
            Contract.findOne({code:data.sourceContract.code}, (err, sourceContract)=>{
                if (err){
                    return next();
                }
                if (!sourceContract){
                    console.log('source contract not found!');
                    return next();
                }
                data.sourceContract= sourceContract.getShortForm();
                return next();
            });
        }
        Async.series([
            loadCustomer,
            loadProductModel,
            loadProduct,
            loadAssets,
            typeCastDates,
            loadMeterLimits,
            loadChargeableSpares,
            loadFreeConsumables,
            loadMeterCharges,
            loadSourceContract
        ], exitF);
    };

    schemaObj.post('save', function(doc, next){
        // if(!this.$locals.wasNew){
        //     return next();
        // }
        next(); //FIXME: The below code needs to be moved to event based
        const Asset = app.locals.models.Asset;
        const Contract= app.locals.models.Contract;

        const updateAsset= (assetObj, next2)=>{
            Asset.findById(assetObj._id, (err,asset)=>{
                if (err){
                    return next2(err);
                }
                if (!asset){
                    return next2('asset not found!');
                }
                if ((doc.status ===  CONTRACT_STATUS.ACTIVE) || (doc.status === CONTRACT_STATUS.DRAFT)){
                    if (doc.sourceContract?._id && (doc.status === CONTRACT_STATUS.DRAFT)){    //renewal flow
                        return next2();
                    }
                    asset.attachContract(doc.lastModifiedBy, doc, next2);
                }
                else if ((doc.status === CONTRACT_STATUS.EXPIRED) || (doc.status === CONTRACT_STATUS.CANCELLED)){
                    asset.detachContract(doc.lastModifiedBy, doc, next2);
                }
                else {
                    return next2();
                }
            });
        };
        Async.eachSeries(doc.assets, updateAsset, ()=>{});

        const detachAssetsIfAny= ()=>{
            let assetIds= Lodash.map(doc.assets, '_id');
            Asset.find({_id: {$nin:assetIds}, 'contract._id': doc._id}, (err, assetsNotInContract)=>{
                const detachAsset= (asset, next2)=>{
                    asset.detachContract(doc.lastModifiedBy, doc, next2);
                };
                Async.eachSeries(assetsNotInContract, detachAsset, ()=>{});
            });
        }

        detachAssetsIfAny();
    });

    schemaObj.method('generateNextPMForAsset', function(by, asset, dueDate, cb) {
        const Ticket = app.locals.models.Ticket;
        const Settings= app.locals.Settings;
        const deploymentDate= Moment(Settings.deploymentDate, 'YYYY-MM-DD').startOf('day');
        let toSkip = false;
        let pmNumber= 1;
        const assetId = asset._id||Mongoose.Types.ObjectId(asset.id);
        const baseCond = {
            'asset._id': assetId,
            'asset.contract._id': this._id,
            sType: 'pm',
        };
        let pmTicket;
        if (!asset._id){
            asset._id= assetId;
        }
        const checkOpenPMTickets = (next2) => {
            if (!assetId){
                return next2('asset id mandatory');
            }
            let cond = {
                //NOTE: Did not put contract filter as in the past repeated pm tickets got created due to asset
                // being part of multiple contracts due to bug.
                'asset._id': assetId,
                sType: 'pm',
                status: {
                    $nin: [TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED]
                }
            };
            Ticket.count(cond, (err, numOpenPMTickets) => {
                if (err) {
                    return next2(err);
                }
                if (numOpenPMTickets > 0) {
                    toSkip = true;
                    return next2();
                }
                return next2();
            });
        };

        const findNextPMDueDate = (next2) => {
            if (toSkip) {
                return next2();
            }
            if (dueDate) {
                dueDate = Moment(dueDate).startOf('day').toDate();
            }
            const allDueDates = this.pmSchedule;
            const cond = {
                ...baseCond,
                status: TICKET_STATUS.CLOSED
            };

            Ticket.count(cond, (err, numCompletedPMs) => {
                if (err) {
                    return next2(err);
                }
                pmNumber= (numCompletedPMs+1);
                if (dueDate){
                    return next2();
                }
                if (numCompletedPMs >= allDueDates.length) {
                    toSkip = true;
                    return next2();
                }
                let nextPMDueDate = Moment(allDueDates[numCompletedPMs]).startOf('day');
                if (Moment(nextPMDueDate).diff(deploymentDate, 'days')< 0){ //pm tickets due before deployment date
                    toSkip= true;
                    for(let index=numCompletedPMs+1; index<allDueDates.length; index++){
                        pmNumber+=1;
                        nextPMDueDate = Moment(allDueDates[index]).startOf('day');
                        if (Moment(nextPMDueDate).diff(deploymentDate, 'days')>= 0) {
                            toSkip= false;
                            break;
                        }
                    }
                }
                if (toSkip){
                    return next2();
                }
                const today = Moment().startOf('day');
                if (nextPMDueDate.diff(today, 'days') <= 10) {
                    dueDate = nextPMDueDate.toDate();
                } else {
                    toSkip = true;
                }
                return next2();
            });
        };

        const createPMTicket = (next2) => {
            if (toSkip) {
                return next2();
            }
            const data = {
                sType: 'pm',
                name: 'PM ' + pmNumber,
                asset,
                dueDate,
                customerId: this.customer._id,
                source: 'system_generated'
            };
            Ticket.create(by, data, (err, tkt)=>{
                pmTicket= tkt;
                next2(err);
            }, true);
        }
        let steps = [
            checkOpenPMTickets,
            findNextPMDueDate,
            createPMTicket,
        ]
        Async.series(steps, (err)=>{
            cb(err,pmTicket);
        });
    });

    schemaObj.method('noteInitialMeterReadings', function(by,data, cb){
        const Asset= app.locals.models.Asset;
        const MeterType= app.locals.models.MeterType;
        //All assets are from same product model

        let meterTypes= [];
        let updatedContract;

        const loadMeterTypes= (next)=>{
            MeterType.find({}, (err, records)=>{
                if (err){
                    return next();
                }
                meterTypes= [];
                records.forEach((record)=>{
                    meterTypes.push(record.getShortForm());
                });
                return next();
            });
        };

        const loadAssets = (next) => {
            if (!data.assets || !data.assets.length) {
                return next();
            }
            let initialMeterReadingsByAssetId = {};
            let assetIds= [];
            let hasMeterReadings= false;
            if (!data.assets[0].id){
                assetIds= data.assets;
            }
            else {
                assetIds = Lodash.map(data.assets, (asset) => {
                    initialMeterReadingsByAssetId[asset.id] = asset.initialMeterReadings;
                    return Mongoose.Types.ObjectId(asset.id);
                });
                hasMeterReadings= hasMeters;
            }

            Asset.find({_id: {$in: assetIds}}, {}, (err, records) => {
                if (err) {
                    return next(err);
                }
                data.assets = [];
                const prepareAssetData= (record, next2) =>{
                    let asset = record.getShortForm();
                    asset.serialNumber = record.serialNumber;
                    data.assets.push(asset);
                    if (!hasMeterReadings){
                        return next2();
                    }
                    let meterReadings = initialMeterReadingsByAssetId[asset._id.toString()];
                    let meterReadingsByTypeId = {};
                    Lodash.map(meterReadings, (mr) => {
                        meterReadingsByTypeId[mr.id] = mr.reading;
                        return;
                    });
                    asset.initialMeterReadings = Lodash.map(meterTypes, (mt) => {
                        return {...mt, reading: meterReadingsByTypeId[mt._id.toString()]};
                    });
                    record.noteMeterReadings(by,[...asset.initialMeterReadings], undefined, undefined, (err)=>{
                        if (err){
                            return next2(err);
                        }
                        return next2();
                    });
                };
                Async.eachSeries(records, prepareAssetData, next);
            });
        };

        const saveContract= (next)=>{
            this.set('assets', data.assets);
            this.markModified('assets');
            this.save((err, updatedDoc)=>{
                updatedContract= updatedDoc
                next(err)
            });
        }

        Async.series([
                loadMeterTypes,
                loadAssets,
                saveContract
            ],
            (err)=>{
                return cb(err, updatedContract);
            }
        );
    });

    schemaObj.method('generateNextPms', function(by, cb) {
        let count=0;
        let pmTickets= [];
        if (!Settings.contract.isPMEnabled){
            return cb();
        }
        if (this.status !== CONTRACT_STATUS.ACTIVE){
            return cb();
        }
        Async.eachSeries(this.assets, (asset, next)=>{
            this.generateNextPMForAsset(by, asset, undefined, (err, tkt)=>{
                if (err){
                    return next(err);
                }
                if (tkt){
                    pmTickets.push(tkt.code);
                }
                return next();
            });
        }, (err)=>{
            if (err){
                console.log('error generating next pms', err);
            }
            else {
                console.log(`PM tickets created for contract  ${this.code} ${count}.`);
                console.log('Ticket ids for contract', this.code, pmTickets);
            }
            return cb(err);
        });
    });

    schemaObj.method('cancel', function(by, data, cb){
        this.status= CONTRACT_STATUS.CANCELLED;
        this.lastModifiedBy= by;
        const Asset= app.locals.models.Asset;
        Asset.find({'contract._id':this._id}, {}, (err, records)=>{
            if (err){
                return cb(err);
            }
            if (records.length === 0){
                return this.save(cb);
            }

            const detachContract= (record, next)=>{
                console.log('detaching contract for ', record.code);
                record.detachContract(by, this, next);
            };

            Async.eachSeries(records, detachContract, (err)=>{
                if(err){
                    return cb(err);
                }
                this.save(cb);
            });
        });
    });

    schemaObj.statics.cancel = function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if(err){
                return cb(err);
            }
            if(!record){
                return cb('Contract not found!');
            }
            record.cancel(by, data, (err)=>{
                cb(err, record);
            });
        });
    };

    schemaObj.statics.generateNextPM4Asset = function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if(err){
                return cb(err);
            }
            if(!record){
                return cb('Contract not found!');
            }
            record.generateNextPMForAsset(by, data.asset, data.dueDate||new Date(), cb);
        });
    };

    schemaObj.method('setScheduleDayPreference', function(by, data, cb){
        this.lastModifiedBy= by;
        this.scheduleDayPreference= {...data.scheduleDayPreference};
        this.markModified('scheduleDayPreference');
        this.save(cb);
    });

    schemaObj.statics.setScheduleDayPreference = function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if(err){
                return cb(err);
            }
            if(!record){
                return cb('Contract not found!');
            }
            record.setScheduleDayPreference(by, data, (err)=>{
                return cb(err, record);
            });
        });
    };

    schemaObj.statics.noteInitialMeterReadings= function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if(err){
                return cb(err);
            }
            if(!record){
                return cb('Contract not found!');
            }
            record.noteInitialMeterReadings(by, data, (err, updatedRecord)=>{
                return cb(err, updatedRecord);
            });
        });
    };

    const Contract = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Contract= Contract;

    schemaObj.index({"name":1});
    schemaObj.index({"seqId":1});
    schemaObj.index({"code":1});
    schemaObj.index({"contact.phoneNumber":1});
    schemaObj.index({"contact.altPhoneNumber":1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(
        sysUser._id,
        COLLECTION_NAME,
        Settings.contract.seqCounterStart||0,
        {prefix:Settings.contract.numberPrefix, padding:4},
        (err)=> {
            return doneCb(err);
        }
    );

};
