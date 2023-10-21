const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Moment = require('moment');
const FSExtra = require('fs-extra');
const Async = require('async');
const Excel = require("exceljs");
const CloneDeep = require('clone-deep');
const Lodash = require('lodash');
const TemplaterObject = require('json-templater/object');
const TemplaterString = require('json-templater/string');

const Utils = require('../utils');
const BaseReportsDef = require("../../config/core/reports");
const {next} = require("lodash/seq");
const {getDataScopeAccessConditions} = require("../utils");
const CollSchemaShort= Utils.CollSchemaShort;
const util = require('util')


// // alternative shortcut
// console.log(util.inspect(myObject, false, null, true /* enable colors */))


const COLLECTION_NAME = 'report';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const ReportsDef = CloneDeep(BaseReportsDef);

    const schemaObj = new Schema({
        name        : {
            type    : String,
            unique  : true
        },
        creator     : {
            type    : String,
            required: false
        },
        rType       : {
            type    : String,
            required: true
        },
        filters     :{},
        status      : {
            type    : String,
            default : 'queued',
            enum    : ['queued', 'generating', 'generated', 'failed']
        }
    });

    schemaObj.pre('save', function (next){
        if (!this.isNew){
            return next();
        }
        this.name= `${ReportsDef[this.rType].name}-${Moment(new Date().toISOString()).format('DD-MM-YYYY hh-mm a')}`;
        return next();
    });

    schemaObj.method('updateStatus', function (by, status, cb){
        this.status= status;
        this.lastModifiedBy= by._id || by.id;
        this.creator = by.name;
        this.save(cb);
    });

    schemaObj.method('generate', function (by, cb){
        let records = [];
        let transformations= {};
        let collections = {};
        let accessConditions= {};
        let reportDef= {...ReportsDef[this.rType].data};

        const loadAccessConditions= (next)=>{
            let entity= reportDef.collection;
            const Model = app.locals.models[entity];
            getDataScopeAccessConditions(app, Model.modelName, by, (err, conditions)=> {
                if(err){
                    return next();
                }
                accessConditions= conditions.filter;
                return next();
            });
        };

        const processReportDef = (next)=>{
            const { projection, fieldNamespace, projection2 } = reportDef;
            let fields= Settings[fieldNamespace]?.fields || {};
            let {preferredTransformationFunction} = Settings.report;
            const processFieldDef= (fieldDef) =>{
                if (fieldDef.featureFlag && !Lodash.get(Settings, fieldDef.featureFlag)){
                    fieldDef.id= '';//workaround to skip a column
                    return;
                }
                if (fieldDef.fieldIdPath){
                    fieldDef.fieldId= Lodash.get(Settings, fieldDef.fieldIdPath);
                }
                if (fieldDef.fieldId){
                    if (fields[fieldDef.fieldId]){
                        fieldDef.id= fieldDef.fieldId;
                        if (!fieldDef.name){
                            fieldDef.name= fields[fieldDef.id].label;
                        }
                    }
                }
                if (fieldDef.stringId){
                    fieldDef.name= Lodash.get(Settings, 'strings.'+fieldDef.stringId);
                }
                if (fieldDef[preferredTransformationFunction]){
                    transformations[fieldDef.id]= fieldDef[preferredTransformationFunction];
                }
                else if (fieldDef.fun){
                    transformations[fieldDef.id]= fieldDef.fun;
                }
                if (fieldDef.collect){
                    collections[fieldDef.id] = fieldDef.collect;
                }
            };
            for(let fieldDef of projection){
                processFieldDef(fieldDef);
            }
            if (projection2){
                for(let fieldDef of projection2){
                    processFieldDef(fieldDef);
                }
            }
            return next();
        };

        const loadData = (next) =>{
            const { collection, condition, projection, projection2, groupBy, accumulatorCheck, unwind } = ReportsDef[this.rType].data;
            const Model = app.locals.models[collection];
            let projectionObj={};
            let projectionObj2={};
            for(let fieldDef of projection){
                if (!fieldDef.id) {
                    continue;
                }
                projectionObj[fieldDef.id] = `$${fieldDef.path||fieldDef.id}`;
            }
            if (projection2){
                for(let fieldDef of projection2){
                    if (!fieldDef.id) {
                        continue;
                    }
                    projectionObj2[fieldDef.id] = `$${fieldDef.path||fieldDef.id}`;
                }
            }

            let startDate= Moment().startOf('month').toDate();
            let endDate= new Date();
            if (this.filters){
                startDate= Moment(this.filters.startDate).startOf('day').toDate();
                endDate= Moment(this.filters.endDate).endOf('day').toDate();
            }
            const DateTime = app.locals.services.DateTime;
            let todayStartOfDay= DateTime.getMoment().startOf('day').toDate();
            let todayEndOfDay= DateTime.getMoment().endOf('day').toDate();
            let context={todayStartOfDay, todayEndOfDay, startDate,endDate};
            let filledCondition= TemplaterObject(condition, context);
            for (let key in accessConditions){
                filledCondition[key]= accessConditions[key];
            }
            let aggPipeline = [{$match: filledCondition}];
            if (groupBy){
                aggPipeline.push({$group: groupBy});
            }
            aggPipeline.push({$project: projectionObj });
            aggPipeline.push({$sort: { 'createdOn': -1}} );
            if (unwind){
                aggPipeline.push({$unwind:{path: '$'+unwind.id}});
            }
            if (accumulatorCheck) {
                aggPipeline.splice(2,0,accumulatorCheck);
            }
            if (projection2){
                aggPipeline.push({$project: projectionObj2 });
            }
            // console.log(util.inspect(aggPipeline, {showHidden: false, depth: null, colors: true}))
            Model.aggregate(aggPipeline)
                .then((result) => {
                    records = result;
                    return next();
                })
                .catch((err) => {
                    return next(err);
                });
        }

        const collect = (next) => {
            let getRow = (object,keyToRemove) => {
                let {[keyToRemove]: deletedKey,...otherKeys} = object;
                return otherKeys;
            }
            let recordsCopy = [...records], rowsToRemove = [];
            for(let item of recordsCopy){
                for(let key of Object.keys(item)){
                    if(collections[key]){
                        let values = item[key];
                        let rows = [];
                        for(let value of values){
                            let row = getRow(item,key);
                            for(let header of collections[key]){
                                row[header.id] = (value[header.from] && value[header.from].name ? value[header.from].name : value[header.from]) || 0;
                            }
                            rows.push(row); 
                        }
                        rowsToRemove.push(records.indexOf(item))
                        records.splice(records.indexOf(item)+1,0,...rows);
                    }
                }
            }
            for(let rowNo of rowsToRemove){
                records.splice(rowNo,1);
            }
            return next();
        }

        const transform = (next) => {
            let rowIndex=0;
            try {
                for(let item of records){
                    item._seqId= rowIndex+1;
                    let origRecord= {...item}
                    for(let key of Object.keys(transformations)){
                        item[key] = transformations[key](item[key], rowIndex, origRecord);
                    }
                    rowIndex++;
                }
            }
            catch(e){
                console.log(e);
            }
            this.updateStatus(by, 'generating', next);
        };

        const writeToFile = (next) => {
            const { projection, unwind, projection2 } = ReportsDef[this.rType].data;
            const workbook =new Excel.Workbook();
            const worksheet = workbook.addWorksheet('Report');
            const columns = [{ header:'SL. NO', key:'_seqId', width: 5 }];
            let allColumns= [];
            if (projection2){
                allColumns= projection2;
            }
            else {
                allColumns= projection;
            }
            for(let fieldDef of allColumns){
                if (!fieldDef.id || !fieldDef.name){
                    continue;
                }
                if(collections[fieldDef.id]){
                    for(let header of collections[fieldDef.id]){
                        columns.push({ header:header.name.toUpperCase(), key:header.id, width: header.width||25 });
                    }
                } else {
                    columns.push({ header:fieldDef.name.toUpperCase(), key:fieldDef.id, width: fieldDef.width||25 });
                }
            }
            worksheet.columns = columns;
            worksheet.addRows(records);
            workbook.xlsx.writeFile(this.get('filePath'))
                .then(() => {
                    this.updateStatus(by, 'generated', next);
                })
                .catch(err => {
                    this.updateStatus(by,'failed',next);
                    return next(err);
                });
        };

        Async.series([
            loadAccessConditions,
            processReportDef,
            loadData,
            collect,
            transform,
            writeToFile
        ], (err) => {
            return cb(err);
        });
    });

    schemaObj.method('purgeFile', function (cb){
        let filePath= this.get('filePath');
        FSExtra.pathExists(filePath, (err, exists) =>{
            if (err){
                return cb(err);
            }
            if (exists){
                FSExtra.remove(filePath, err => {
                    if (err) {
                        return cb(err)
                    }
                    return cb();
                });
                return;
            }
            return cb();
        });
    });

    schemaObj.pre('find', function() {
        if (!this.options){
            this.options= {};
        }
        if (!this.options.sort){
            this.options.sort = {createdOn: -1};
        }
    });

    schemaObj.virtual('filePath').get(function() {
        return `${app.locals.dirs.reports}/${this.name}.xlsx`;
    });

    schemaObj.virtual('url').get(function() {
        const baseUrl = `${app.locals.credentials.baseUrl}`;
        const orgSeqId = app.locals.id;
        return `${baseUrl}api/org/${orgSeqId}/report/open/${this.name}.xlsx`;
    });

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.statics.purgeOld=  function (cb)  {
        this.find({createdOn: {$lte: Moment().subtract(7, 'days').startOf('day').toDate()}}, (err, records)=>{
            if (err){
                return cb(err);
            }

            console.log(`About to delete ${records.length} old reports`);
            const deleteRecord= (record, next) =>{
                record.purgeFile((err1)=>{
                    if (err1){
                        console.log('error while purging report file', err1);
                        return next();
                    }
                    this.deleteOne({_id:record._id}, next);
                });
            };

            Async.eachSeries(records, deleteRecord, cb);
        });
    };

    app.locals.models.Report = Db.model(COLLECTION_NAME, schemaObj);

    const processReportDef= (cb)=>{
        //Move pre processing of the report def to here
        cb();
    };

    return processReportDef(doneCb);
};
