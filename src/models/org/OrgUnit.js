const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Async = require('async');

const Utils = require('../utils');
const CollSchemaShort= Utils.CollSchemaShort;
const AddressSchema = Utils.AddressSchema;

const COLLECTION_NAME = 'orgUnit';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const ORG_UNIT_TYPES = Utils.getIds(Settings.orgUnit.types);

    const schemaObj = new Schema({
        name        : {
            type    : String,
            required: true,
            unique  : true,
            trim    : true
        },
        code        : {
            type    : String,
            unique  : true,
            required: true,
            trim    : true
        },
        orgUnitType : { //predefined types configured at org
            type    : String,
            required: true,
            enum    : ['_root', ...ORG_UNIT_TYPES]
        },
        parent      : {...CollSchemaShort},
        ancestorIds : [ObjectId],
        address     : {...AddressSchema},
        clusters  : [{type: ObjectId, ref:'cluster'}] ,
        clusterIds: [{type:ObjectId}],
        custom      : {}
    });

    schemaObj.pre('findOne', function (next) {
        this.populate("clusters");
        next();
    });

    schemaObj.statics.processInputData = function(by,inputData,cb) {
        let data = { ...inputData };
        const exitF = (err) => {
            console.log("done with processing", err, data);
            return cb(err, data);
        };

        const loadParent = (next) => {
            if (!data.parent) {
                return next();
            }
            this.findById(data.parent, (err, parent) => {
                if (err) {
                    return next(err);
                }
                if (!parent) {
                    return next('parent not found ');
                }
                data.parent = parent.getShortForm();
                return next();
            });
        };

        Async.series([
            loadParent
        ], exitF);
    };

    schemaObj.statics.sync = function(dupRecord,cb) {
        let cond= {}, updateValues= {};
        cond['parent._id']= dupRecord.id;
        updateValues= {
            parent: dupRecord.getShortForm()
        };
        this.updateMany(cond, {$set:updateValues}, {}, cb);
    };

    schemaObj.pre('save', function (next) {
        this.$locals.isNewDoc = this.isNew;
        if (Settings.cluster.isEnabled){
            let clusterIds= [];
            (this.clusterIds||[]).forEach((clusterId)=>{
                clusterIds.push(Mongoose.Types.ObjectId(clusterId));
            });
            this.clusterIds= [...clusterIds];
            this.clusters= [...clusterIds];
            this.markModified('clusterIds');
            this.markModified('clusters');
        }
        next();
    });

    schemaObj.post('save', function (doc,next) {
        if(this.$locals.isNewDoc ){
            next();
        }
        else{
            const types = app.locals.Settings.orgUnit.types;
            const orgUnitType = types.filter(item => item.id === doc.orgUnitType)[0];
            if (!orgUnitType){
                return next();
            }
            if(!orgUnitType.isLeaf){
                app.locals.models.OrgUnit.sync(doc,next);
            }
            else{
                next();
            }
        }
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr= query.q;
            let conditions= {};
            conditions={
                'name': {$regex: new RegExp('.*'+searchStr+'.*', 'i')}
            }
            delete query.q;
            query = {...conditions};
        }
        const types = app.locals.Settings.orgUnit.types;
        let filterTypes= [];
        for (let type of types){
            if (type.id=== query.higherThan){
                break;
            }
            filterTypes.push(type.id);
        }
        if (query.higherThan){
            delete query.higherThan;
        }
        if (!query.orgUnitType){
            query.orgUnitType= {$in: filterTypes};
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

    schemaObj.methods.updateSettings = function (by, data, cb) {
        const updateCustomFields= (next) =>{
            if (!this.custom){
                this.custom= {};
            }
            for (let key in data.custom){
                this.custom[key]= data.custom[key];
            }
            this.markModified('custom');
            return next();
        };


        const addEventLog= (next) => {
            return next();
            // let evt = getEventInstance(by, EVENT.UPDATE_BASIC_DETAILS, this);
            // evt.save((err) => {
            //     if (err) {
            //         return next(err);
            //     }
            //     this.lastEvent = evt;
            //     this.markModified('lastEvent');
            //     return next();
            // });
        };

        Async.series([updateCustomFields, addEventLog], (err) =>{
            if (err){
                return cb(err);
            }
            this.save((err)=>{
                cb(err, this);
            });
        });
    };

    schemaObj.statics.updateSettings = function(by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if (err) {
                return cb(err);
            }
            record.updateSettings(by, data, cb);
        });
    };

    schemaObj.statics.getRoot= function (cb){
        this.findOne({code:'_root'}, cb);
    };

    schemaObj.statics.createRootIfNotExists= function (by, cb) {
        const OrgUnit= this;
        OrgUnit.findOne({code:'_root'}, (err, doc)=>{
            if(err){
                return cb(err);
            }
            if (doc){
                return cb();
            }
            let newDoc= new OrgUnit({
                name: 'Root Org Unit',
                code: '_root',
                orgUnitType: '_root',
                createdBy: by._id
            });
            newDoc.save(cb);
        });
    };


    app.locals.models.OrgUnit = Db.model(COLLECTION_NAME, schemaObj);

    schemaObj.index({'parent._id':1});
    schemaObj.index({'ancestorIds':1});
    schemaObj.index({'code':1});

    return doneCb();
};
