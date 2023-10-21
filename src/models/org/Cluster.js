const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Async = require('async');

const Utils = require('../utils');
const CollSchemaShort = Utils.CollSchemaShort;

const COLLECTION_NAME = 'cluster';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const CollectionSettings= Settings.cluster;

    const schemaObj = new Schema({
        name: {
            type: String,
            trim: true,
            required: true
        },
        code: {
            type: String,
            unique: true,
        },
        seqId: {
            type: Number,
            unique: true,
        },
        secondaryCode: {
            type: String,
            trim: true,
            unique: true
        },

        sites: [{type: ObjectId, ref:'site'}],
        siteIds: [{type:ObjectId}]
    });

    schemaObj.virtual('displayName').get(function() {
        if(this.secondaryCode){
            return  this.name + ' '+this.secondaryCode;
        }
        return this.name;
    });

    schemaObj.pre('findOne', function (next) {
        this.populate("sites");
        next();
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let conditions = {
                '$or': [
                    {'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')}},
                    {'code': searchStr},
                    {'secondaryCode': searchStr}
                ]
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
        let siteIds= [];
        (this.siteIds||[]).forEach((siteId)=>{
            siteIds.push(Mongoose.Types.ObjectId(siteId));
        });
        this.siteIds= [...siteIds];
        this.sites= [...siteIds];
        this.markModified('siteIds');
        this.markModified('sites');
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

    schemaObj.post('save', function (doc,next) {
        //FIXME: Sync in all the collections where there is replication.
        // const Asset = app.locals.models.Asset;
        // const doSync = (Model, next2) => {
        //     Model.sync(COLLECTION_NAME, this, next2);
        // };
        // Async.eachSeries([Asset, Ticket], doSync, next);
        const Site= app.locals.models.Site;
        const siteIds= this.siteIds;
        const updateSitesWithClusterId= (next2)=> {
            Site.updateMany({_id: {$in:siteIds}}, {$set:{clusterId: this._id}}, (err, rec)=>{
                if(err){
                    return next2(err);
                }
                return next2();
            });
        };

        const removeStaleReferences= (next2)=>{
            Site.updateMany({_id: {$nin:siteIds}, clusterId: this._id}, {$unset:{clusterId: undefined}}, (err, rec)=>{
                if(err){
                    return next2(err);
                }
                return next2();
            });
        };

        Async.series([updateSitesWithClusterId, removeStaleReferences], next);
    });

    const Cluster = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Cluster = Cluster;

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.index({'name': 1}, {unique: true});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'secondaryCode': 1}, {unique: true, sparse: true});
    schemaObj.index({'seqId': 1}, {unique: true});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: 'CLS', padding: 4}, (err) => {
        doneCb(err);
    });

    return;
};
