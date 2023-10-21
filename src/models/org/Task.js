const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Async = require('async');
const Utils = require('../utils');
const CollSchemaShort = Utils.CollSchemaShort;
const Moment= require('moment');
const K = require("../../K");

const COLLECTION_NAME = 'task';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const CollectionSettings= Settings.task;
    const SEQ_ID_PADDING= CollectionSettings.task|| 6;
    const SEQ_CODE_PREFIX= 'TASK';

    const runningTasks= {   //holds all ongoing tasks in RAM

    };

    const schemaObj = new Schema({
        name: {
            type: String,
            trim: true,
            required: true
        },
        code: {
            type: String,
            // required: true
        },
        seqId: {
            type: Number,
            // required: true
        },
        secondaryCode: {
            type: String,
            trim: true
        },
        orgUnit: {
            ...CollSchemaShort,
        },
        file: {
            ...CollSchemaShort,
            url: {type: String}
        },
        type: {
            type: String,
            enum:[
                'uploadAssets',
                'sendAssetStatusUpdate',
                'sendCampaign',
                'uploadDealers'
            ]
        },
        summary: {

        },
        total: {    //total no.of records
            type: Number
        },
        processed: {    //No.of records processed
            type: Number
        },
        error: {

        },
        runStartAt: {
            type: Date
        },
        runEndAt: {
            type: Date
        },
        runDuration: {
            type: Number    //in milliseconds
        },
        data: {},   //processed Data
        status: {
            type: String,
            default: 'queued',
            enum: ['queued', 'dryRun', 'commit', 'finished']
        },
        subStatus: {
            type: String,
            enum: ['reading', 'verifying', 'saving', 'failed', 'success']
        }
    });

    schemaObj.virtual('isRunning').get(function() {
        return runningTasks[this._id.toString()];
    });

    // schemaObj.virtual('cluster', {
    //     ref: 'cluster',
    //     localField: 'clusterId',
    //     foreignField: '_id',
    //     justOne: true
    // });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let regExpSearch= {$regex: new RegExp('.*' + searchStr + '.*', 'i')};
            let conditions = {
                '$or': [
                    {'name': regExpSearch},
                    {'code': searchStr},
                    {'secondaryCode': searchStr}
                ]
            };
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
        let projection= {data:false};
        //TODO: fix this, if projection comes use that else use default projection
        this.projection(projection);
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('count', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('countDocuments', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('save', function (done) {
        const genSeqId= (next2) =>{
            if (!this.isNew) {
                return next2();
            }
            Counter.getNextSequence(COLLECTION_NAME, (err, {code, seqId, paddedSeqId}) => {
                if (err) {
                    console.log(err);
                    return next2('error while getNextSequence!');
                }
                this.code = code;
                this.seqId = seqId;
                return next2();
            });
        };
        if (this.runStartAt && this.runEndAt){
            this.runDuration= Moment(this.runEndAt).diff(this.runStartAt, 's');
        }

        Async.series([genSeqId], done);
    });

    schemaObj.post('save', function (doc,next) {
        return next();
    });

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name,
            code: this.code,
            secondaryCode: this.secondaryCode
        };
    };

    schemaObj.methods.initRun= function (cb){
        if (!this.summary) {
            this.summary = {};
        }

        this.summary[this.status]= {
            skipped: [],
            processed: [],
            errored: [],
        };
        if (!this.data){
            this.data= {};
        }
        this.total= 0;
        this.processed= 0;
        this.error= undefined;
        this.runStartAt= new Date();
        this.runEndAt= undefined;
        this.runDuration= 0;
        this.subStatus= undefined;
        this.markModified('error'); //clearing error
        this.markModified(['summary', this.status].join('.'));
        this.save(cb);
    };

    schemaObj.methods.finishRun= function (err, cb, total, processed){
        let subStatus = 'success';
        if (err) {
            this.error= {
                details: JSON.stringify(err)
            };
            this.markModified('error');
            subStatus = 'failed';
        }
        if(total){
            this.total= total;
        }
        if (processed){
            this.processed= processed;
        }
        this.summary[this.status].stats= {
            numSkipped: this.summary[this.status].skipped?.length,
            numProcessed: this.summary[this.status].processed?.length,
            numErrored: this.summary[this.status].errored?.length ||0
        }
        if (this.status === 'commit'){
            this.status= 'finished';
        }
        this.subStatus= subStatus;
        this.markModified(['summary', this.status, 'stats'].join('.'));
        this.save(cb);
    }

    schemaObj.methods.updateProgress= function (processed, cb) {
        this.processed= processed;
        this.save(cb);
    }

    schemaObj.methods.setSubStatus= function (subStatus, total, cb) {
        this.subStatus= subStatus;
        if (total){
            this.total= total;
        }
        this.save(cb);
    };

    schemaObj.methods.add2Error= function (obj){
        this.summary[this.status].processed.push(obj);
        this.markModified(['summary', this.status, 'errored'].join('.'));
    }

    schemaObj.methods.add2Skipped= function (obj){
        this.summary[this.status].skipped.push(obj);
        this.markModified(['summary', this.status, 'skipped'].join('.'));
    };

    schemaObj.methods.add2Processed= function (obj){
        this.summary[this.status].processed.push(obj);
        this.markModified(['summary', this.status, 'processed'].join('.'));
    };

    schemaObj.methods.dryRun= function (by, cb, wait4Finish=false){
        const currTask= this;
        const {dryRun}= require('../../tasks/web/'+this.type)(app);
        if (runningTasks[this._id.toString()]){
            return setTimeout(()=>{
                cb('Task is already running. Please wait...');
            },1)
        }
        runningTasks[this._id.toString()]= {
            ...this.getShortForm(),
            runType: 'dryRun'
        };
        this.status= 'dryRun';
        this.save((err)=>{
            if (err){
                return cb(err);
            }
            dryRun(by, currTask, (err)=>{
                console.log('finished task dry Run', this.code, err);
                let missingMasters= {};
                this.summary.dryRun.skipped.forEach((skipped)=>{
                    let masterId;
                    if (skipped.code === 0x01){
                        masterId= skipped.details.model+'  '+ skipped.details.color;
                    }
                    else if (skipped.code === 0x04){
                        masterId= skipped.details.orgUnitCode;
                    }
                    if (!missingMasters[skipped.code]){
                        missingMasters[skipped.code]= {};
                    }
                    if (!missingMasters[skipped.code][masterId]){
                        missingMasters[skipped.code][masterId]= 0;
                    }
                    missingMasters[skipped.code][masterId]++;
                });
                this.summary.dryRun.missingMasters= missingMasters;
                this.markModified('summary.dryRun.missingMasters');
                this.runEndAt= new Date();
                this.save((err)=>{
                    if (err){
                        console.log(err);
                    }
                    delete runningTasks[this._id.toString()];
                    if (wait4Finish){
                        cb(err, this);
                    }
                });
            });
            if (!wait4Finish){
                cb(undefined, this); //intentionally returning immediately as it is async task
            }
        });
    };

    schemaObj.methods.commit= function (by, cb, wait4Finish=false){
        const currTask= this;
        const {commit}= require('../../tasks/web/'+this.type)(app);
        if (runningTasks[this._id.toString()]){
            return setTimeout(()=>{
                cb('Task is already running. Please wait...');
            },1)
        }
        runningTasks[this._id.toString()]= {
            ...this.getShortForm(),
            runType: 'commit'
        };
        this.status= 'commit';
        this.save((err)=>{
            if (err){
                return cb(err);
            }
            commit(by, currTask, (err)=>{
                console.log('finished task commit', this.code, err);
                this.runEndAt= new Date();
                this.save((err)=>{
                    if (err){
                        console.log(err);
                    }
                    delete runningTasks[this._id.toString()];
                    if (wait4Finish){
                        cb(err, this);
                    }
                });
            });
            if (!wait4Finish){
                cb(undefined, this); //intentionally returning immediately as it is async task
            }
        });
    };

    schemaObj.statics.processInputData = function(by,inputData,cb) {
        let data = { ...inputData };
        const OrgUser = app.locals.models.OrgUser;

        const noOp = next => {
            return next();
        };        

        Async.series([ noOp ],(err) => {
            return cb(err,data);
        });
    };

    schemaObj.statics.createAndExecTask= function (by, data, cb) {
        const File= app.locals.models.File;
        const Task= app.locals.models.Task;
        let record;
        const createEntry= (next)=>{
            record= new Task({
                createdBy: by,
                type: data.type,
                name: data.file?.name||data.type
            });
            return next();
        };
        const saveFile= (next)=>{
            if(!data.file){
                return next();
            }
            let fileData={
                ...data.file,
                ref: {
                    rType: 'task',
                    _id: record._id
                }
            };
            File.saveFile(by, fileData,  (err, result)=>{
                if (err){
                    return next(err);
                }
                record.file= result.getShortForm();
                record.file.url= result.get('url');
                return next();
            });
        };

        const loadOrgUnit = (next)=>{
            if (!data.orgUnitId){
                return next();
            }
            const OrgUnit= app.locals.models.OrgUnit;
            OrgUnit.findById(data.orgUnitId, (err, orgUnit)=>{
                if(err){
                    return next();
                }
                record.orgUnit= orgUnit.getShortForm();
                return next();
            });
        }

        const saveTaskEntry= (next)=>{
            record.save(next);
        };

        const startDryRun=(next)=>{
            record.dryRun(by,()=>{
                //Intentionally not waiting here as this is going to be asynchronous task
            });
            return next();
        };

        Async.series([createEntry, saveFile, loadOrgUnit, saveTaskEntry, startDryRun], (err)=>{
            cb(err, record);
        });
    };

    schemaObj.statics.dryRun= function(by, id, data, cb) {
        this.findById(id, (err, doc) => {
            if (err) {
                return cb({...K.ERROR.MONGO_FIND, details: err});
            }
            if (!doc) {
                return cb({...K.ERROR.DOC_NOT_FOUND});
            }
            doc.dryRun(by, cb);
        });
    };

    schemaObj.statics.commit= function(by, id, data, cb) {
        this.findById(id, (err, doc) => {
            if (err) {
                return cb({...K.ERROR.MONGO_FIND, details: err});
            }
            if (!doc) {
                return cb({...K.ERROR.DOC_NOT_FOUND});
            }
            doc.commit(by, cb);
        });
    };


    const Task = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Task = Task;

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.index({'name': 1}, {unique:true});
    schemaObj.index({'seqId': 1}, {unique: true});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'type': 1, createdOn:-1});
    schemaObj.index({'secondaryCode': 1}, {unique: true, sparse: true});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: SEQ_CODE_PREFIX, padding: SEQ_ID_PADDING}, (err) => {
        doneCb(err);
    });

    return;
};
