const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Validator = require('validator');
const Async = require('async');
const Moment = require('moment');

const Utils = require('../utils');
const CollSchemaShort = Utils.CollSchemaShort;
const AddressSchema = Utils.AddressSchema;
const ContactSchema = Utils.ContactSchema;

const COLLECTION_NAME = 'customer';

const EVENT = {
    CREATE: {
        name: 'Created',
        code: 0x001,
    },
    UPDATE_BASIC_DETAILS: {
        name: 'Updated Basic Details',
        code: 0x002
    },
    UPDATE_CONTACT_DETAILS: {
        name: 'Updated Contact Details',
        code: 0x03
    },
    UPDATE_ADDRESS: {
        name: 'Updated Address',
        code: 0x04
    },
    UPDATE_TECHNICIAN: {
        name: 'Updated Technician',
        code: 0x005
    },
    ACTIVATE: {
        name: 'Activated',
        code: 0x006
    },
    DEACTIVATE: {
        name: 'Deactivated',
        code: 0x007
    }
};


module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const CUSTOMER_TYPES = Lodash.map(Settings.customer.types, 'id');
    const CUSTOMER_GRADES = Lodash.map(Settings.customer.grades, 'id');

    const schemaObj = new Schema({
        title: {
            type: String,
            // enum: ['Mr', 'Ms', 'Mrs','Dr']
        },
        firstName: {
            type: String,
            trim: true
        },
        lastName: {
            type: String,
            trim: true
        },
        name: {
            type: String,
            trim: true,
            required: true
        },
        gstin: {
            type: String,
        },
        code: {
            type: String,
        },
        seqId: {
            type: Number
        },
        secondaryCode: {
            type: String,
            trim: true
        },
        custType: {
            type: String,
            default: CUSTOMER_TYPES[0],
            enum: CUSTOMER_TYPES,
        },
        /**
         * @desc -  Used to classify the customers based on their spend etc
         */
        grade: {
            type: String,
            default: CUSTOMER_GRADES[0],
            enum: CUSTOMER_GRADES
        },

        address: {...AddressSchema},
        contact: {...ContactSchema},
        secondaryContact: {...ContactSchema},

        technician: {...CollSchemaShort},
        accountMgr: {...CollSchemaShort},
        orgUnit: {
            ...CollSchemaShort,
            ancestorIds: [ObjectId]
        },

        //computed fields
        numAssets: {
            type: Number,
            default: 0
        },
        stats: {     //Temporary purpose
            revenue: {type: Number},   //sum of all contracts value //TODO: need to add
            numTickets: {type: Number}, //Includes both open and closed
        },
        isActive: {
            type    : Boolean,
            default : true
        },
        rateCard: { 
            code: {type: String},
            name: {type: String}
        },
        remarks: {
            type: String
        },
        lastEvent   : Schema.Types.Mixed,
    });

    schemaObj.virtual('access').get(function() {
        let actions= {
            activate: true,
            deactivate: true
        };
        if (this.isActive){
            actions.activate= false;
        }
        else {
            actions.deactivate= false;
        }
        return actions;
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let searchRegExp= new RegExp('.*' + searchStr + '.*', 'i');
            let conditions = {};
            if (Validator.isMobilePhone(searchStr)) {
                conditions = {
                    '$or': [
                        {'contact.phoneNumber': searchStr},
                        {'contact.altPhoneNumber': searchStr}
                    ]
                };
            } else {
                conditions = {
                    '$or': [
                        {'name': {$regex: searchRegExp}},
                        {'code': searchStr},
                        {'secondaryCode': searchStr},
                        {'contact.phoneNumber': {$regex: searchRegExp}}
                    ]
                }
            }
            delete query.q;
            query = {...conditions};    //While searching other filters are purposefully ignored
        }
        if (query.excludeIds) {
            query._id = {
                $nin: Lodash.map(query.excludeIds, (id) => {
                    return Mongoose.Types.ObjectId(id)
                })
            };
            delete query.excludeIds;
        }
        if (query.status){
            if (query.status === 'active'){
                query.isActive= {$ne: false};
            }
            else if (query.status === 'inactive'){
                query.isActive = false
            }
            query.isDeleted = {$ne: true};
            delete query.status;
        }
        else {
            query.isActive= {$ne: false};
        }
        if (query.created){
            if (query.created === 'thisMonth') {
                query.createdOn = {$gte: Moment().startOf('month').startOf('day').toDate()}
            }
            delete query.created;
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
        if (this.name){
            this.firstName= this.name;
        }
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

    schemaObj.post('save', function (doc, next) {
        //FIXME: Sync in all the collections where there is replication.
        const Asset = app.locals.models.Asset;
        const Ticket = app.locals.models.Ticket;
        const Site= app.locals.models.Site;

        const doSync = (Model, next2) => {
            Model.sync(COLLECTION_NAME, doc, next2);
        };

        Async.eachSeries([Asset, Ticket], doSync, ()=>{
            const createUpdateSite= (next2)=>{
                if(!Settings.site.autoCreateFromCustomer){
                    return next2();
                }
                let site;
                let cond= {'customer._id': doc._id};
                if (Settings.site.isQRCodesEnabled){
                    cond= {$or:[{customerId: doc._id}, {status:'draft'}]}
                }
                Site.findOne(cond, (err, record)=>{
                    if (err){
                        return next2(err);
                    }
                    if(record){
                        site=record;
                    }
                    else {
                        console.log('Warning: new site is created');
                        site= new Site({
                            createdBy: doc.createdBy,
                        });
                    }
                    site.name= doc.name;
                    site.customerId= doc._id;
                    site.status= 'active';
                    site.lastModifiedBy= doc.lastModifiedBy;
                    return site.save(next2);
                })
            };

            const createUpdateUser= (next2)=>{
                if (!Settings.customer.isLoginEnabled){
                    return next2();
                }
                const OrgUser= app.locals.models.OrgUser;
                OrgUser.findOne({'globalUser.uniqueId': doc.contact?.phoneNumber}, (err, user)=>{
                    if(err){
                        return next2(err);
                    }
                    let by= doc.lastModifiedBy||doc.createdBy;
                    let data= {
                        title: doc.title,
                        isVirtual: true,
                        virtualRef: {
                            _id: doc._id,
                            rType: 'customer'
                        },
                        role: 'customer',
                        firstName: doc.firstName,
                        lastName: doc.lastName,
                        code: doc.code,
                        globalUser: {
                            uniqueId: doc.contact.phoneNumber,
                            email: doc.contact.email
                        }
                    };
                    if (!user){ //create new user
                        return OrgUser.doCreate(doc.createdBy, data, (err)=>{
                            console.log('error creating uer corresponding to customer: ', doc.firstName);
                            next2();
                        });
                    }
                    return OrgUser.doUpdate(by, user._id, data, (err)=>{
                        console.log('error updating user corresponding to customer: ', doc.firstName);
                        next2();
                    });
                });
            };

            Async.series([createUpdateSite, createUpdateUser], next);
        });
    });

    schemaObj.methods.computeStats = function (callback) {

        const updateActiveStatus = ()=>{

        }


        return callback();
    };

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name,
            code: this.code,
            secondaryCode: this.secondaryCode
        };
    };

    schemaObj.statics.addAssets = function (by, id, data, cb) {
        const Asset = app.locals.models.Asset;
        let ids = Lodash.map(data.assetIds, (id) => Mongoose.Types.ObjectId(id));
        let numAssets = ids.length;
        let customer;

        const loadCustomer = next => {
            this.findById(id, (err, doc) => {
                if (err) return next(err);
                if (!doc) return next('customer not found');
                customer = doc;
                return next();
            });
        };

        const updateAssetsWithSite = next => {
            Asset.updateMany(
                {_id: {$in: ids},'site._id': { $exists: true } },
                {$set: {customer: customer.getShortForm(),contact: customer.contact}},
                {multi: true},
                next
            );
        };

        const updateAssetsWithoutSite = next => {
            Asset.updateMany(
                {_id: {$in: ids},'site._id': { $exists: false } },
                {$set: { customer: customer.getShortForm(), contact: customer.contact, address: customer.address }},
                {multi: true},
                next
            );
        };

        const updateCustomer = next => {
            this.findByIdAndUpdate(id, {$inc: {numAssets}}, (err) => {
                if (err) return next(err);
                return next();
            });
        };

        Async.series([
            loadCustomer,
            updateAssetsWithSite,
            updateAssetsWithoutSite,
            updateCustomer,
        ], (err) => {
            if (err) cb(err);
            cb();
        });
    };

    schemaObj.statics.deactivate = function(by, id, data, cb){
        const Asset = app.locals.models.Asset;
        const Contract = app.locals.models.Contract;
        const Ticket = app.locals.models.Ticket;

        let customer;

        const loadCustomer= (next)=>{
            this.findById(id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('Customer not found!');
                }
                customer= record;
                return next();
            });
        };

        const loadAsset = next => {
            Asset.findOne({ 'customer._id': id },(err,record) => {
                if(err) {
                    return next(err);
                }
                if(record){
                    return next('Customer has Assets Mapped.');
                }
                return next();
            });
        };

        const loadContract = next => {
            Contract.findOne({ 'customer._id': id, status: '03_active' },(err,record) => {
                if(err) {
                    return next(err);
                }
                if(record) {
                    return next('Customer has Active Contract.');
                }
                return next();
            });
        };

        const loadTicket = next => {
            Ticket.findOne({ 'customer._id': id, status: { $nin: ['05_closed', '06_cancelled'] } },(err,record) => {
                if(err) {
                    return next(err);
                }
                if(record) {
                    return next('Customer has Open Ticket.');
                }
                return next();
            });
        };
        
        const updateCustomer = next => {
            customer.isActive= false;
            customer.remarks= data.remarks;
            customer.lastModifiedBy= by._id;
            const event = getEventInstance(by,EVENT.DEACTIVATE,this);
            event.save(err => {
                if(err) {
                    return next(err);
                }
                customer.lastEvent = event;
                customer.markModified('lastEvent');
                customer.save(next);
            });
        };

        Async.series([
            loadCustomer,
            loadAsset,
            loadContract,
            loadTicket,
            updateCustomer
        ], (err) => {
            return cb(err, customer);
        });
    };

    schemaObj.statics.addRateCard = function(by,id,data,cb){
        const RateCard = app.locals.models.RateCard;
        let rateCard;

        const loadRateCard = next => {
            RateCard.findById(data.rateCard,(err,record) => {
                if(err) return next(err);
                if(!record) return next('Rate Card Not Found');
                rateCard = record.getShortForm();
                return next();
            });
        };
             
        const updateCustomer = next => {
            this.findById(id,(err,record) => {
                if(err) return next(err);
                if(!record) return next('Customer not found');
                record.rateCard = rateCard;
                record.save(next);
            });
        }

        Async.series([
            loadRateCard,
            updateCustomer
        ],(err)=>{
            if(err) cb(err);
            cb(false);
        })
    };

    schemaObj.statics.processInputData = function(by,inputData,cb) {
        let data = { ...inputData };
        const OrgUser= app.locals.models.OrgUser;
        if (!data.accountManagerId){
            return cb(undefined, data);
        }
        OrgUser.findById(data.accountManagerId, (err, user)=>{
            if (err){
                return cb(err);
            }
            if (!user){
                return cb('account manager not found!');
            }
            data.accountMgr= user.getShortForm();
            return cb(null, data);
        });
    };

    function getEventInstance(by, event, customer) {
        const Event = app.locals.models.EventLog;
        let evt = new Event({
            evtType: event.code,
            desc : event.desc||event.name,
            doneBy: {
                _id: by._id||by.id,
                name: by.name,
                code: by.code
            },
            scope:{
                sType:'asset',
                _id: customer._id,
                code: customer.secondaryCode || customer.code
            },
            createdBy: by._id||by.id,
            when: new Date()
        });
        return evt;
    }


    schemaObj.methods.activate = function(by,data,cb){
        this.isActive= true;
        this.remarks= data.remarks;
        const event = getEventInstance(by,EVENT.ACTIVATE,this);
        event.save(err => {
            if(err) return cb(err);
            this.lastEvent = event;
            this.markModified('lastEvent');
            this.save(err => cb(err,this));
        });
    };

    schemaObj.statics.activate = function(by, id, data, cb) {
        this.findById(id, (err, customer)=>{
            if (err) {
                return cb(err);
            }
            customer.activate(by, data, cb);
        });
    };


    const Customer = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Customer = Customer;

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.index({'name': 1});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'secondaryCode': 1}, {unique: true, sparse: true});
    schemaObj.index({'seqId': 1}, {unique: true});
    schemaObj.index({'contact.phoneNumber': 1});
    schemaObj.index({'contact.altPhoneNumber': 1});
    schemaObj.index({'stats.revenue': 1});
    schemaObj.index({'stats.numTickets': 1});
    schemaObj.index({'createdOn': 1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: 'CUST', padding: 6}, (err) => {
        doneCb(err);
    });

    return;
};
