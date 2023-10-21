const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const Lodash = require('lodash');
const Async = require('async');
const COLLECTION_NAME = 'rateCard';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const schemaObj = new Schema({
        name: {
            type            : String,
            trim            : true,
            required        : true
        },
        code :{
            type: String
        },
        seqId: {
            type: String
        },
        prices: [],
        productCategories: [],
        isDefault: { type: Boolean, default: false }
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let conditions = {};
            conditions = {
                '$or': [
                    {'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')}}
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

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name,
            price: this.price,
            service: this.service
        };
    };

    schemaObj.statics.processInputData = function(by,inputData,cb) {
        let data = { ...inputData };
        const Service = app.locals.models.Service;
        const ProductCategory = app.locals.models.ProductCategory;

        const loadServices = next => {
            if (!data.services) {
                return next();
            }
            let serviceIds = Object.keys(data.services);
            const ids = Lodash.map(serviceIds, (id) => Mongoose.Types.ObjectId(id));
            Service.find({ _id: { $in: ids } },{},(err,record) => {
                if(err) return next(err);
                if(!record) return next('No service found');
                const prices = [];
                record.forEach(item => {
                    prices.push({
                        service: item.getShortForm(),
                        price: data.services[item._id]
                    })
                });
                delete data.services;
                data.prices = prices;
                return next();
            });
        };
        
        const loadProductCategories = next => {
            if (!data.categories) {
                return next();
            }
            let categoryIds = Object.keys(data.categories);
            const ids = Lodash.map(categoryIds, (id) => Mongoose.Types.ObjectId(id));
            let productCategories = [];
            ProductCategory.find({ _id: { $in: ids } },{},(err,record) => {
                if(err) return next(err);
                if(!record) return next('No service found');
                Async.each(record,(item,callback) => {
                    let category = {
                        productCategory: item.getShortForm()
                    };
                    let ids = Object.keys(data.categories[item.id]);
                    const serviceIds = Lodash.map(ids, (id) => Mongoose.Types.ObjectId(id));
                    Service.find({ _id: { $in: serviceIds } },{},(err,services) => {
                        if(err) return next(err);
                        if(!services) return next('No service found');
                        const prices = [];
                        services.forEach(serviceObj => {
                            prices.push({
                                service: serviceObj.getShortForm(),
                                price: data.categories[item._id][serviceObj._id]
                            })
                        });
                        category.prices = prices;
                        productCategories.push(category);
                        return callback();
                    });
                },(err) => {
                    delete data.categories;
                    data.productCategories = productCategories;
                    return next();
                })
            });
        };

        Async.series([ loadServices, loadProductCategories ],(err) => {
            return cb(err,data);
        });
    };

    schemaObj.statics.markDefault = function(id,flag,cb){
        let rateCard;
        const loadDefaultRateCard = next => {
            if(!flag) return next();
            this.findOne({ isDefault: true },(err,record) => {
                if(err) return next(err);
                if(!record) return next();
                record.isDefault = false;
                record.save(next);
            });
        };

        const loadRateCard = next => {
            this.findById(id,(err,record) => {
                if(err) return next(err);
                if(!record) return next('Rate Card Not Found');
                rateCard = record;
                return next();
            });
        }

        const updateRateCard = next => {
            rateCard.isDefault = flag;
            rateCard.save(next);
        };

        Async.series([
            loadDefaultRateCard,
            loadRateCard,
            updateRateCard
        ],(err)=>{
            if(err) cb(err);
            cb(false);
        })
    };

    schemaObj.statics.addCustomers = function(id, data,cb){
        let rateCard;
        let customerIds= data.customerIds;

        const Customer= app.locals.models.Customer;

        const loadRateCard= (next)=>{
            this.findById(id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return  next('no rate card found!');
                }
                rateCard= record;
                return next();
            });
        };

        const addRateCard2Customers= (next) =>{
            const updateCustomer= (custId, next2)=>{
                Customer.findById(custId, (err, record)=>{
                    if (err){
                        return next2(err);
                    }
                    record.rateCard= rateCard.getShortForm();
                    record.markModified('rateCard');
                    record.save(next2);
                });
            };
            Async.eachSeries(customerIds, updateCustomer, next);
        };

        Async.series([loadRateCard, addRateCard2Customers], (err)=>{
            return cb(err, rateCard);
        });
    }

    const RateCard = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.RateCard = RateCard;

    schemaObj.index({'name': 1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: 'RC', padding: 4}, (err) => {
        doneCb(err);
    });

    return;
};
