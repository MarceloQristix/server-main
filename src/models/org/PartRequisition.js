
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Utils = require('../utils');
const Async = require("async");
const {TICKET_STATUS} = require("../abstract/Ticket");
const Util = require("util");
const {mkdirpSync} = require("fs-extra");
const Moment = require("moment");
const EJS = require("ejs");
const FS = require("fs");

const COLLECTION_NAME = 'partRequisition';
const EVENT= {
    CREATE: {
        code: 0x0001,
        name: 'Created'
    },
    PUT_ON_HOLD: {
        code: 0x0002,
        name: 'Put on Hold'
    },
    UPDATE: {
        code: 0x0003,
        name: 'Updated'
    },
    FULFILL: {
        code: 0x0004,
        name: 'Issued Parts & Generated Ticket'
    },
    CANCEL: {
        code: 0x0005,
        name: 'Cancelled'
    }
};

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const Settings= app.locals.Settings;
    const HOLD_REASONS= [];
    Settings.partRequisition.holdReasons.forEach((reason)=>{
        HOLD_REASONS.push(reason.id);
    });
    const schemaObj = new Schema({
        name: {
            type: String,
            unique: true,
        },
        code: {
            type: String,
            unique: true
        },
        seqId: {
            type: Number,
            unique: true
        },
        sourceTicket: {
            ... Utils.CollSchemaShort
        },
        newTicket: {    //part pending ticket created as previous ticket was closed automatically
            ...Utils.CollSchemaShort
        },
        requester: { //Original Ticket Assignee
            ...Utils.CollSchemaShort
        },
        issuedTo: { //New ticket assignee
            ...Utils.CollSchemaShort
        },
        parts: [{
            name: String,
            _id: ObjectId,
            partType: {
                type: String,
                enum: ['sparePart', 'consumable']
            },
            previousQuantity: Number,
            quantity: Number,    //requested/updated post request
            fulfilledQuantity: Number,
            isAdditional: {type: Boolean},
            lastReplacementTicket: {}   //populated in post find middleware
        }],
        status: {
            type: String,
            default: 'open',
            enum: ['open', 'hold', 'fulfilled', 'cancelled']
        },
        holdReason: {type:String, enum: HOLD_REASONS},
        holdRemarks: {type:String},
        holdOn: {type:Date},
        fulfilledOn: {
            type:Date
        },
        cancelledOn: {
            type: Date
        },
        updateRemarks: {
            type: String,
            trim: true
        },
        remarks: {
            type: String,
            trim: true
        },
        asset: {
            ...Utils.CollSchemaShort,
            secondaryCode: {type: String},
            serialNumber: {type: String},
            secondarySerialNumber: {type: String},
            extraCode1: {type: String},
            extraCode2: {type: String},
            locatedAt: {type: String},
            isUnderWarranty: {type:Boolean},
            serviceProvidedBy: {type: String},

            contract: {...Utils.CollSchemaShort},
            model: {...Utils.CollSchemaShort},
            customer: {...Utils.CollSchemaShort}
        },
        assetExt: {},   //to populate in post findOne
        sparesReplacedHistory: {},  //only for the sake of post hook send this extra data to server, model should not save this data
        consumablesFulfilledHistory: {}
    });

    const formatQuery = function (query) {
        let searchConditions;
        if (query.q) {
            let searchStr= query.q;
            let conditions= {};
            let regexp= {$regex: new RegExp('.*'+searchStr+'.*', 'i')};
            conditions={
                '$or': [
                    {'code': regexp},
                    {'sourceTicket.code': regexp},
                    {'newTicket.code': regexp},
                    {'asset.customer.name': regexp}
                ]
            }
            delete query.q;
            searchConditions = {...conditions};    //While searching other filters are purposefully ignored
        }
        if (query.requesterId){
            query['requester._id']= Mongoose.Types.ObjectId(query.requesterId);
            delete query.requesterId;
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
        if (!this.isNew){
            return next();
        }
        Counter.getNextSequence(COLLECTION_NAME, (err, {seqId, code})=>{
            if (err){
                console.log(err);
                return next('error while getNextSequence!');
            }
            this.seqId= seqId;
            this.code= code;
            this.name= code;
            next();
        });
    });

    schemaObj.post('findOne', function (result, next) {
        if (!result){
            return next();
        }
        const Ticket= app.locals.models.Ticket;
        const Asset= app.locals.models.Asset;

        let assetId= result.asset?._id;
        let spareIds= [];
        let consumableIds= [];
        let sparesReplacedHistory= {};
        let consumablesFulfilledHistory= {};
        result.parts.forEach((material)=>{
            if (material.partType === 'sparePart'){
                spareIds.push(material.id)
                if ((material.id)) {
                    spareIds.push(Mongoose.Types.ObjectId(material.id));
                }
                sparesReplacedHistory[material.id.toString()]= [];
            }
            else {
                consumableIds.push(material.id);
                if ((material.id)){
                    consumableIds.push(Mongoose.Types.ObjectId(material.id));
                }
                consumablesFulfilledHistory[material.id.toString()]=[];
            }
        });

        let cond= {
            '$or': [
                {'asset._id': assetId, 'sparesReplaced._id': {$in: spareIds}},
                {'asset._id': assetId, 'consumablesFulfilled._id': {$in: consumableIds}}
            ]
        };
        let projection= {code:1, _id:1, completedOn:1, sparesReplaced:1, consumablesFulfilled:1, meterReadings:1};

        const loadAssetDetails= (postPopulate) => {
            Asset.findById(assetId, (err, record)=>{
               if(err){
                   return postPopulate(err);
               }
               if (!record){
                   return postPopulate('asset not found!');
               }
               console.log('asset>',record);
               result.assetExt= record.toObject();
               return postPopulate();
            });
        };

        const loadReplacementData= (postPopulate) =>{
            Ticket.find(cond, projection , {sort:{completedOn:-1}}, (err, records)=>{
                if(err){
                    return postPopulate(err);
                }
                const checkReplacementData= (record, next2)=>{
                    let ticketData= {
                        _id: record._id,
                        code: record.code,
                        completedOn: record.completedOn,
                        meterReadings: record.meterReadings
                    };
                    if (record.sparesReplaced){
                        record.sparesReplaced.forEach((item)=>{
                            let spareId= item._id.toString();
                            if (sparesReplacedHistory[spareId]){
                                sparesReplacedHistory[spareId].push({
                                    ...item,
                                    ticket: ticketData
                                });
                            }
                        });
                    }
                    if (record.consumablesFulfilled){
                        record.consumablesFulfilled.forEach((item)=> {
                            let consumableId = item._id.toString();
                            if (consumablesFulfilledHistory[consumableId]) {
                                consumablesFulfilledHistory[consumableId].push({
                                    ...item,
                                    ticket: ticketData
                                });
                            }
                        });
                    }
                    next2();
                };
                Async.eachSeries(records, checkReplacementData, (err)=>{
                    if (err){
                        return postPopulate(err);
                    }
                    result.parts.forEach((material, index)=> {
                        let previousTickets;
                        let materialId= material.id.toString();
                        if (material.partType === 'sparePart') {
                            previousTickets= sparesReplacedHistory[materialId];
                        }
                        else if (material.partType ===' consumable') {
                            previousTickets= consumablesFulfilledHistory[materialId];
                        }
                        if (previousTickets && previousTickets.length >0) {
                            let lastReplacementTicket= previousTickets[0];
                            let meterReadings= lastReplacementTicket.ticket.meterReadings||[];
                            let meterReadingsTextArr= [];
                            for (let mr of meterReadings){
                                meterReadingsTextArr.push(mr.name + '-'+mr.reading);
                            }
                            console.log('mr',meterReadings);
                            result.parts[index].lastReplacementTicket = {
                                quantity: lastReplacementTicket.quantity,
                                code: lastReplacementTicket.ticket.code,
                                _id: lastReplacementTicket.ticket._id,
                                completedOn: Moment(lastReplacementTicket.ticket.completedOn).format('DD MMM YYYY'),
                                meterReadings: lastReplacementTicket.meterReadings,
                                meterReadingsText: meterReadingsTextArr.join(';')|| '--'
                            }
                        }
                    });
                    postPopulate();
                });
            });

        };
        Async.series([loadAssetDetails, loadReplacementData], next);
    });

    schemaObj.methods.cancel = function(by,data,cb){
        this.status = 'cancelled';
        this.cancelledOn= new Date();
        this.remarks = data.remarks;
        const EventLog= app.locals.models.EventLog;

        const addEventLog= (next) => {
            let evt= Utils.getEventInstance(by, EventLog, EVENT.CANCEL, this, 'partRequisition')
            evt.save((err) => {
                if(err) {
                    return next(err);
                }
                this.lastEvent = evt;
                this.markModified('lastEvent');
                return next();
            });
        };

        Async.series([
            addEventLog
        ],(err) =>{
            if(err) return cb(err);
            this.save(err => cb(err,this));
        });
    };

    schemaObj.statics.cancel = function(by,id,data,cb) {
        this.findById(id,(err, record)=>{
            if(err) return cb(err);
            record.cancel(by,data,cb);
        });
    };

    schemaObj.methods.fulfill = function(by,data,cb){
        this.status = 'fulfilled';
        this.fulfilledOn= new Date();
        this.remarks = data.remarks;
        let {fulfilledParts={}, fulfilledConsumables={}} = data;
        const EventLog= app.locals.models.EventLog;

        const addEventLog= (next) => {
            let evt= Utils.getEventInstance(by, EventLog, EVENT.FULFILL, this, 'partRequisition')
            evt.save((err) => {
                if(err) {
                    return next(err);
                }
                this.lastEvent = evt;
                this.markModified('lastEvent');
                return next();
            });
        };

        const populateIssuedTo= (next) =>{
            const OrgUser= app.locals.models.OrgUser;
            OrgUser.findById(data.issuedToId, (err, orgUserRecord)=>{
                if (err){
                    return next(err);
                }
                if (!orgUserRecord){
                    return  next('user not found !', data.issuedToId);
                }
                this.issuedTo= orgUserRecord.getShortForm();
                this.markModified('issuedTo');
                return next();
            });
        };

        let fulfilledSpareIds= [];
        let fulfilledConsumableIds= [];
        const populateFulfilledQuantity= (next) =>{
            this.parts.forEach((part)=>{
                let partId= part._id.toString();
                if (part.partType === 'consumable'){
                    part.fulfilledQuantity= fulfilledConsumables[partId];
                    if (part.fulfilledQuantity >0){
                        fulfilledConsumableIds.push(partId);
                    }
                }
                else if (part.partType === 'sparePart') {
                    part.fulfilledQuantity= fulfilledParts[partId];
                    if (part.fulfilledQuantity>0){
                        fulfilledSpareIds.push(partId);
                    }
                }
            });
            (data.additionalItems ||[]).forEach((part)=>{
                let partId= part._id; //coming from front end, so _id is string
                if (part.partType === 'consumable'){
                    part.fulfilledQuantity= fulfilledConsumables[partId];
                    if (part.fulfilledQuantity >0){
                        fulfilledConsumableIds.push(partId);
                    }
                }
                else if (part.partType === 'sparePart') {
                    part.fulfilledQuantity= fulfilledParts[partId];
                    if (part.fulfilledQuantity>0){
                        fulfilledSpareIds.push(partId);
                    }
                }
                this.parts.push({...part, isAdditional: true, _id: Mongoose.Types.ObjectId(partId)})
            });
            this.markModified('parts');
            return next();
        };

        let sparesFulfilled= [];
        let consumablesFulfilled= [];
        const loadSparesDetails = (next) =>{
            if (fulfilledSpareIds.length === 0){
                return next();
            }
            const SparePart= app.locals.models.SparePart;
            let partIds= [];
            fulfilledSpareIds.forEach((partId)=>{
                partIds.push(Mongoose.Types.ObjectId(partId));
            });
            SparePart.find({_id: {$in:partIds}}, {_id:1, name:1, code:1, listPrice:1}, (err, partRecords)=>{
                if(err){
                    return next(err);
                }
                partRecords.forEach((item)=>{
                    sparesFulfilled.push({
                        ...item.getShortForm(),
                        listPrice: item.listPrice,
                        quantity: fulfilledParts[item._id.toString()]
                    });
                });
                return next();
            });
        };

        const loadConsumablesDetails = (next) =>{
            if (fulfilledConsumableIds.length === 0){
                return next();
            }
            const Consumable= app.locals.models.Consumable;
            let partIds= [];
            fulfilledConsumableIds.forEach((partId)=>{
                partIds.push(Mongoose.Types.ObjectId(partId));
            });
            Consumable.find({_id: {$in:partIds}}, {_id:1, name:1, code:1, listPrice:1}, (err, partRecords)=>{
                if(err){
                    return next(err);
                }
                partRecords.forEach((item)=>{
                    consumablesFulfilled.push({
                        ...item.getShortForm(),
                        listPrice: item.listPrice,
                        quantity: fulfilledConsumables[item._id.toString()]
                    });
                });
                return next();
            });
        };

        const createTicketIfRequired= (next)=>{
            const Settings= app.locals.Settings;
            const Ticket= app.locals.models.Ticket;
            if (!Settings.ticket.closePartPending){
                return next();
            }
            Ticket.findOne({_id: this.sourceTicket._id}, (err, sourceTicket)=>{
                if(err){
                    return next(err);
                }
                if (!sourceTicket){
                    return next('source ticket not found!');
                }
                if (sourceTicket.status !== TICKET_STATUS.CLOSED){
                    console.log('last ticket was not closed');
                    return next();
                }
                let ticketData= sourceTicket.toObject();
                ticketData.status= TICKET_STATUS.ON_HOLD;
                delete ticketData.seqId;
                delete ticketData.code;
                delete ticketData.completedOn;
                delete ticketData.createdOn;
                delete ticketData.lastEvent;
                ticketData.assignee= {...this.issuedTo};
                ticketData.parentTicket= {...this.sourceTicket};
                ticketData.partReqRef= {...this.getShortForm()};

                //handle partial fulfilment
                if (sparesFulfilled.length >0 ){
                    ticketData.sparesRequired= sparesFulfilled;
                }
                if (consumablesFulfilled.length >0) {
                    ticketData.consumablesRequired= consumablesFulfilled;
                }

                Ticket.create(by, ticketData, (err, tkt)=>{
                    if (err){
                        return next(err);
                    }
                    this.newTicket= tkt.getShortForm();
                    return next();
                });
            });
        };

        Async.series([
            addEventLog,
            populateFulfilledQuantity,
            populateIssuedTo,
            loadSparesDetails,
            loadConsumablesDetails,
            createTicketIfRequired
        ],(err) =>{
            if(err) return cb(err);
            this.save(err => cb(err,this));
        });
    };


    schemaObj.statics.fulfill = function(by,id,data,cb) {
        this.findById(id,(err, record)=>{
            if(err) return cb(err);
            record.fulfill(by,data,cb);
        });
    };

    schemaObj.methods.update2 = function(by,data,cb){
        this.updateRemarks = data.remarks;
        let {updatedParts={}, updatedConsumables={}} = data;
        const EventLog= app.locals.models.EventLog;

        const addEventLog= (next) => {
            let evt= Utils.getEventInstance(by, EventLog, EVENT.UPDATE, this, 'partRequisition')
            evt.save((err) => {
                if(err) {
                    return next(err);
                }
                this.lastEvent = evt;
                this.markModified('lastEvent');
                return next();
            });
        };

        const populateUpdatedQuantity= (next) =>{
            this.parts.forEach((part)=>{
                let partId= part._id.toString();
                if (part.partType === 'consumable'){
                    part.previousQuantity= part.quantity;
                    part.quantity= updatedConsumables[partId];
                }
                else if (part.partType === 'sparePart') {
                    part.previousQuantity= part.quantity;
                    part.quantity= updatedParts[partId];
                }
            });
            (data.additionalItems ||[]).forEach((part)=>{
                let partId= part._id; //coming from front end, so _id is string
                if (part.partType === 'consumable'){
                    part.quantity= updatedConsumables[partId];
                }
                else if (part.partType === 'sparePart') {
                    part.quantity= updatedParts[partId];
                }
                this.parts.push({...part, isAdditional: true, _id: Mongoose.Types.ObjectId(partId)})
            });
            this.markModified('parts');
            return next();
        };

        Async.series([
            addEventLog,
            populateUpdatedQuantity
        ],(err) =>{
            if(err) return cb(err);
            this.save(err => cb(err,this));
        });
    };

    schemaObj.methods.putOnHold = function(by, data, cb){
        this.holdReason = data.holdReason;
        this.holdRemarks= data.holdRemarks;
        this.holdOn= new Date();
        this.status= 'hold';
        const EventLog= app.locals.models.EventLog;
        const addEventLog= (next) => {
            let evt= Utils.getEventInstance(by, EventLog, EVENT.PUT_ON_HOLD, this, 'partRequisition')
            evt.save((err) => {
                if(err) {
                    return next(err);
                }
                this.lastEvent = evt;
                this.markModified('lastEvent');
                return next();
            });
        };

        Async.series([
            addEventLog,
        ],(err) =>{
            if(err) return cb(err);
            this.save(err => cb(err,this));
        });
    };

    schemaObj.statics.update2 = function(by,id,data,cb) {
        this.findById(id,(err, record)=>{
            if(err) return cb(err);
            record.update2(by,data,cb);
        });
    };

    schemaObj.statics.putOnHold = function(by,id,data,cb) {
        this.findById(id,(err, record)=>{
            if(err) return cb(err);
            record.putOnHold(by,data,cb);
        });
    };

    schemaObj.statics.generateMaterialRequisitionForm= function (by, id, data, cb){
        const PartRequisition = this;
        const Ticket= app.locals.models.Ticket;

        const orgSeqId = app.locals.id;
        let outDir = app.locals.dirs.partReqs;
        let fileName= 'material-requisition';
        let htmlOutput= '';
        let mrfUrl= '';
        let partReq;
        let ticket;

        const loadTicket= (next) =>{
            Ticket.findById(partReq.sourceTicket._id, (err, record)=>{
                if(err){
                    return next(err);
                }
                ticket= record;
                return  next();
            });
        };

        const loadPartRequisition= (next) =>{
            PartRequisition.findById(id, (err, record)=>{
                if(err){
                    return next(err);
                }
                partReq= record;
                outDir+= '/'+partReq.code;
                mkdirpSync(outDir);
                mrfUrl= `/data/org/${orgSeqId}/partReqs/${partReq.code}/material-requisition.html`
                return  next();
            });
        };

        const generateHtml = (next) =>{
            const Settings= app.locals.Settings;
            let htmlFile = `${outDir}/${fileName}.html`;
            let data = {};
            let options = {};
            let materialsRequired= [];
            let counter=0;

            (partReq.parts||[]).forEach((spare)=>{
                counter++;
                materialsRequired.push({
                    serial: counter,
                    name: spare.name,
                    quantity: spare.quantity,
                    lastReplacementTicket: spare.lastReplacementTicket
                });
            });
            if (Settings.legalName){
                data.orgUnit= {
                    legalName: Settings.legalName,
                    registeredAddress: Settings.registeredAddress
                }
            }
            data.materialsRequired= materialsRequired;
            data.logo= Settings.logo;
            data.baseUrl = app.locals.credentials.baseUrl;
            data.baseUrl= data.baseUrl.substr(0,data.baseUrl.length-1);
            data.title= `Material Requisition Form - ${ticket.code}`;
            data.ticket= {
                code: ticket.code,
                remarks: ticket.holdRemarks,
                requestDate: Moment(ticket.lastModifiedOn).format('DD-MMM-YYYY')
            };
            data.technician= ticket.assignee? {...ticket.assignee}: {};

            if (ticket.customer){
                data.customer= {
                    name: ticket.customer.name
                }
            }
            if (ticket.address){
                let address= ticket.address;
                let addrFields= [];
                [
                    ticket.asset?.locatedAt,
                    address.addrLine1,
                    address.addrLine2,
                    address.city,
                    address.state,
                    address.pinCode
                ].forEach((field)=>{
                    if (!field){
                        return;
                    }
                    addrFields.push(field);
                });
                data.address= addrFields.join(',');
            }
            if (ticket.asset){
                data.asset= {
                    name: ticket.asset.name,
                    serialNumber: ticket.asset.serialNumber
                }
                data.contract= {
                    code: ticket.asset.contract?.code
                }
            }
            data.media= ticket.media;
            data.meterReadings= [...ticket.meterReadings];

            mrfUrl= data.baseUrl+ mrfUrl;

            EJS.renderFile('tpls/html/preq-material-requisition-form.ejs', data, options, (err, tplOutput)=>{
                if(err){
                    return next(err);
                }
                htmlOutput= tplOutput;
                FS.writeFile(htmlFile, htmlOutput, 'utf8', next);
            });
        };

        Async.series([loadPartRequisition, loadTicket, generateHtml], (err)=>{
            if (err){

                return cb(err);
            }
            cb(undefined, {...ticket.toObject(), mrfUrl});
        });
    }


    const PartRequisition = Db.model(COLLECTION_NAME, schemaObj);

    schemaObj.index({'sourceTicket._id': 1}, {unique: true, sparse: true});
    schemaObj.index({'status': 1});

    app.locals.models.PartRequisition = PartRequisition;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix:'PREQ', padding:6}, (err)=>{
        doneCb(err);
    });

};
