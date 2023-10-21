const Mongoose= require('mongoose');
const Schema  = Mongoose.Schema;
const ObjectId= Schema.ObjectId;
const Moment  = require('moment');
const Async  = require('async');
const Validator = require('validator');
const Lodash = require("lodash");
const JSONStringTemplater = require('json-templater/string');
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(Moment);

const AbstractTicket = require('../abstract/Ticket');
const EJS = require("ejs");
const FS = require("fs");
const {mkdirpSync} = require("fs-extra");
const {TIMESTAMP_KEY} = require("pino-pretty/lib/constants");
const Utils = require("../utils");
const path = require("path");
const MaskEmailsPhones = require("mask-email-phone");
const TicketSchema = AbstractTicket.schema();
const TICKET_STATUS= AbstractTicket.TICKET_STATUS;
const STYPE= AbstractTicket.STYPE;

const COLLECTION_NAME = 'ticket';
const EVENT= {
    CREATED     : {
        code    : 0x001,
        id      : "created",
        name    : "Created",
    },
    ASSIGNED    : {
        code    : 0x002,
        id      : "assigned",
        name   : "Assigned"
    },
    NOTIFICATION2ASSIGNEE: {
        code    : 0x003,
        id      :"notification_sent",
        name   : "Sent Notification"
    },
    RE_ASSIGNED : {
        code    : 0x004,
        id      : "re_assigned",
        name   : "Re Assigned"
    },
    STARTED     : {
        code    : 0x005,
        id      : "started",
        name    : "Started Work"
    },
    PAUSED      : {
        code    : 0x006,
        id      : "paused",
        name    : "Set On Hold"
    },
    RESUMED     : {
        code    : 0x007,
        id      : "resumed",
        name    : 'Continued work'
    },
    MARKED_PENDING     : {
        code    : 0x008,
        id      : 'marked_pending',
        name    : 'Marked as pending with reason '
    },
    CLOSED   : {
        code    : 0x009,
        id      : "closed",
        name    : "Closed"
    },
    CANCELLED   : {
        code    : 0x00A,
        id      : "cancelled",
        name    : "Cancelled"
    },
    UPDATED : {
        code: 0x00B,
        id: "updated",
        name: "Updated"
    },
    CUSTOMER_COMMUNICATOIN_SENT: {
        code: 0x00B,
        id: "customerCommunicationSent",
        name: "Communication to Customer"
    }
};

module.exports= function(app, doneCb){
    const Db = app.locals.Db;
    const STYPE_PREFIX= {...AbstractTicket.STYPE_PREFIX};
    const Settings = app.locals.Settings;
    const CollectionSettings= Settings.ticket;
    STYPE_PREFIX.support= CollectionSettings.seqCodePrefix||'TKT';

    const schema= new Schema(TicketSchema);

    const formatQuery = function (query, cb) {
        let searchConditions;
        if (query.assigneeId) {
            query['assignee._id']= Mongoose.Types.ObjectId(query.assigneeId);
            delete query.assigneeId;
        }
        if (query.customerId) {
            query['customer._id']= Mongoose.Types.ObjectId(query.customerId);
            delete query.customerId;
        }
        if (query.assetId){
            query['asset._id']= Mongoose.Types.ObjectId(query.assetId);
            delete query.assetId;
        }
        let assetCode= query.assetCode || query['asset.code'];
        if(assetCode){
            let seqId= parseInt(assetCode.replace('ASSET',''),16);
            query['asset.code'] = {$in:[assetCode, 'ASSET'+((seqId+'').padStart(4, '0'))]};
            delete query.assetCode;
        }
        if (query.sType && Array.isArray(query.sType)){
            query.sType = {$in: [...query.sType]};
        }
        if (query.status && Array.isArray(query.status)){
            query.status = {$in: [...query.status]};
        }
        if (query.status === 'notClosed'){
            query.status = {$nin: ['05_closed', '06_cancelled']};
        }
        if (query.q) {
            let searchStr= query.q;
            let regExp= {$regex: new RegExp('.*'+searchStr+'.*', 'i')};
            let conditions= {};
            let fieldWiseRegExps= [];
            if (Validator.isMobilePhone(searchStr)){
                fieldWiseRegExps= [
                    {'contact.phoneNumber': searchStr },
                    {'asset.code': searchStr},
                    {'asset.serialNumber': searchStr},
                    {'asset.secondaryCode': searchStr},
                ];
            }
            else {
                let tktSeqId = Number(searchStr);
                if (tktSeqId) {
                    fieldWiseRegExps= [
                        {'seqId': tktSeqId},
                        {'asset.code': searchStr},
                        {'asset.serialNumber': searchStr},
                        {'asset.secondaryCode': searchStr},
                    ];
                }
                else {
                    fieldWiseRegExps = [
                        {'customer.name': regExp},
                        {'asset.code': searchStr},
                        {'asset.serialNumber': searchStr},
                        {'asset.secondaryCode': searchStr},
                        {'code': searchStr}
                    ];
                }
            }
            for (let searchField of CollectionSettings.additionalSearchFields||[]){
                let cond= {};
                cond[searchField]= regExp;
                fieldWiseRegExps.push(cond);
            }
            conditions={
                '$or': fieldWiseRegExps
            }
            delete query.q;
            searchConditions= {...conditions};
        }
        if (query.dueDate){
            let startDate;
            let endDate;
            if (Array.isArray(query.dueDate)) {
                startDate= new Date(query.dueDate[0]);
                endDate= new Date(query.dueDate[1]);
            }
            else {
                if (query.dueDate === 'next7days'){
                    startDate= Moment().startOf('day').toDate();
                    endDate= Moment().startOf('day').add(7, 'days').toDate();
                }
            }
            if (startDate){
                query.dueDate = {$gte: startDate};
            }
            if (endDate) {
                query.dueDate['$lte']= endDate;
            }
        }
        if (query.created){
            if (query.created === 'today'){
                query.createdOn= {$gte: Moment().startOf('day').toDate()}
            }
            delete query.created;
        }
        if (query.closed){
            if (query.closed === 'today'){
                query.completedOn= {$gte: Moment().startOf('day').toDate()}
            }
            delete query.closed;
        }
        if (query.tatExceeded){
            query.status= {$ne:'05_closed'};
            // isTATExceeded: true, //FIXME : this value is not getting populated
            query.createdOn= {$lte: Moment().subtract(2, 'days').toDate()}
            delete query.tatExceeded;
        }
        if (query.assignee === 'exists'){
            query.assignee= {$exists: true};
        }
        else if (query.assignee === 'none'){
            query.assignee= {$exists: false};
        }
        if (searchConditions){
            query= {...query, ...searchConditions};
        }
        if (query.contractId){
            query['asset.contract._id']= Mongoose.Types.ObjectId(query.contractId);
            delete query.contractId;
        }
        if (query.statId){
            let [day, entityId, statId]= query.statId.split('.');
            const TktStats= app.locals.models.TktStats;
            TktStats.findOne({entityId: Mongoose.Types.ObjectId(entityId), day}, (err, statRecord)=>{
                query._id= {$in:statRecord?.metaData?.[statId]?.ids};
                delete query.statId;
                return cb(undefined, query);
            });
        }
        else {
            return cb(undefined, query);
        }
    };

    schema.pre('find', function(next) {
        if (!this.options){
            this.options= {};
        }
        if (!this.options.sort){
            this.options.sort = {lastModifiedOn:-1, dueDate:1, createdOn: -1};
        }
        let projection= {media:false, pmCheckList: false};
        //TODO: fix this, if projection comes use that else use default projection
        this.projection(projection);
        formatQuery(this.getQuery(), (err, query)=>{
            this.setQuery(query);
            next();
        });
    });

    schema.pre('count', function(next) {
        formatQuery(this.getQuery(), (err, query)=>{
            this.setQuery(query);
            next();
        });
    });

    schema.pre('countDocuments', function(next) {
        formatQuery(this.getQuery(), (err, query)=>{
            this.setQuery(query);
            next();
        });
    });

    //@STARTOF : METHOD

    schema.pre('save', function (next){
        if (this.status === TICKET_STATUS.RESOLVED || this.status === TICKET_STATUS.CLOSED){
            if (this.startedOn){
                if (!this.finishedOn){
                    this.finishedOn= new Date();
                }
                this.workDuration= this.finishedOn.getTime() - this.startedOn.getTime();
            }
        }
        this.lastModifiedOn= new Date();
        return next();
    });

    const NOTIFICATION_TEMPLATES= {
        CREATION : "{{code}} :  {{site.name}} has submitted a  request for service ticket registration.",
        CLOSURE : "Tickets for  {{site.name}}'s request  have been registered. {{code}} is closed."
    };

    schema.method('notifyCustomer', function (evt, by){
        const Settings= app.locals.Settings;
        if (!Settings.ticket.notifyCustomerTicketStatusUpdate){
            return;
        }
        const Customer= app.locals.models.Customer;
        let customer;
        let ticket= this;
        let doc= this;

        const loadCustomer= (next)=>{
            if (!this.customer?._id){
                return next();
            }
            Customer.findById(this.customer._id, (err, record)=>{
                if(err){
                    return next(err);
                }
                if (!record){
                    return next('customer not found')
                }
                customer= record;
                return next();
            });
        };

        const sendEmail= (next) =>{
            let customerEmail;
            if (customer){
                customerEmail= customer.contact?.email||'';
            }
            else {
                customerEmail= this.contact?.email||'';
            }
            if (!Validator.isEmail(customerEmail)){
                customerEmail= '';
            }
            if (!customerEmail){
                console.log(`${this.code}, could not find customer email id`, this.customer.name);
                return next();
            }
            const Settings= app.locals.Settings;
            const mainApp = app.locals.mainApp;
            const emailService = mainApp.locals.services.Email;
            const emailTemplateName = evt === 'CREATION' ? 'ticket-creation.ejs': 'ticket-closure.ejs';
            let subject= evt === 'CREATION' ? 'Your Issue/Request Has Been Registered': 'Your Issue/Request Has Been Resolved !';
            const emailTemplate= path.join('./tpls/html', emailTemplateName);

            let baseUrl= app.locals.credentials.baseUrl;
            let emailAssetsBaseUrl= `${app.locals.credentials.baseUrl}/images/email-assets/ticket`;
            let appBaseUrl=`${app.locals.credentials.baseUrl}/appv2`;
            const from= Settings.email.from ;

            let data= {
                emailAssetsBaseUrl,
                ticket,
                customer,
                baseUrl,
                appBaseUrl,
                settings:Settings
            };
            data.logo= `${app.locals.credentials.baseUrl}/${Settings.logo}`;
            data.createdOn= Moment(ticket.createdOn).format('MMMM Do YYYY');
            data.completedOn=  Moment(ticket.completedOn).format('MMMM Do YYYY');
            data.supportNumbers= data.settings.support.numbers.join(', ')

            emailService.sendEJS(subject, emailTemplate, data, customerEmail, from,function(err) {
                if(err){
                    console.log(`Error sending status update Email to ${customerEmail} ${err}`);
                    return next(err);
                }
                console.log(`Status update sent to user ${customer.name} to ${customerEmail}`);
                next();
            });
        }

        let orgUnit, parentOrgUnit;
        const loadOrgUnitInfo= (next) =>{
            const OrgUnit= app.locals.models.OrgUnit;
            if (Settings.orgUnitProfile.isGlobal){
                OrgUnit.getRoot((err, record)=>{
                    parentOrgUnit= record;
                    return next();
                });
                return;
            }
            if (!doc.orgUnit?._id){
                return next();
            }
            OrgUnit.findById(doc.orgUnit?._id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('orgunit not found!');
                }
                orgUnit= record;
                // from.name= orgUnit.name;
                if (!record.parent?._id){
                    return next('parent OrgUnit not found!');
                }
                OrgUnit.findById(record.parent._id, (err, record)=>{
                    if (err){
                        return next(err);
                    }
                    if (!record){
                        return next('parent OrgUnit record not found!');
                    }
                    parentOrgUnit= record;
                    return next();
                });
            });
        };

        const triggerSMS = (templateStrId, data, doneCB)=>{
            const template= parentOrgUnit.custom.smsTemplates[templateStrId];
            const senderId= parentOrgUnit.custom.senderId;
            // const template= app.locals.Settings.sms.template[templateStrId];
            const mainApp = app.locals.mainApp;
            if (!template || !template.text){
                console.log('sms config not done!');
                return doneCB();
            }

            mainApp.locals.services.SMS.send(userMobile, template, data, (err)=>{
                if(err){
                    console.log(`Error sending status update SMS to ${userMobile} ${err}`);
                }
                doneCB();
            }, {useSubAccount: true, config:{senderId, apiKey: parentOrgUnit.custom.apiKey}});
        }

        let isCommunicationSent= false;
        let  userMobile= this.contact?.phoneNumber||'';
        const sendSMS= (next)=>{
            if (!Settings.ticket.isSMSEnabled){
                return next();
            }

            if (!Validator.isMobilePhone(userMobile)){
                userMobile= '';
            }
            if (!userMobile){
                return next();
            }
            let TemplateMap= {
                "CREATION": "ticketCreation",
                "UPDATE": "ticketStatusUpdate",
                "CLOSURE": "ticketClosure"
            }
            let templateStrId= TemplateMap[evt];
            let data= {};
            const isCustomSMS= Settings.ticket.isCustomSM;
            let subTypeStr= Settings.strings.ticket.subType?.[this.subType];
            let sTypeStr= Settings.strings.ticket.sType[doc.sType].replace(' Request', '');
            const handlePostSendSMS= (err)=>{
                if (!err){
                    isCommunicationSent= true;
                }
                next(err);
            }
            switch (evt){
                case "CREATION":
                    if (isCustomSMS){
                        data.arr= [
                            subTypeStr,
                            this.code
                        ];
                    }
                    else {
                        data.arr= [
                            sTypeStr,
                            doc.code + ' - '+ Settings.name
                        ]
                    }
                    triggerSMS(templateStrId, data, handlePostSendSMS);
                    break;
                case "UPDATE":
                    let messages= Settings.ticket.subStatus[this.subStatus].messages;
                    const doSendSMS= (message, next2) =>{
                        let primaryField= message.primaryField;
                        let primaryFieldLabel= Settings.strings.ticket.abbrFields[primaryField];
                        let targetDate= Moment(this.custom[primaryField], 'YYYY-MM-DD').format('DD MMM');
                        data.arr= [
                            `${this.code} for ${subTypeStr}`,
                            `${primaryFieldLabel} ${targetDate}`
                        ];
                        triggerSMS(templateStrId, data, next2);
                    };
                    Async.eachSeries(messages, doSendSMS, (err)=>{
                        handlePostSendSMS(err);
                    });
                    break;
                case "CLOSURE":
                    if (isCustomSMS){
                        data.arr= [
                            this.code,
                            subTypeStr
                        ];
                    }
                    else {
                        data.arr= [
                            doc.code +' for '+ sTypeStr,
                            '- '+Settings.name
                        ]
                    }
                    triggerSMS(templateStrId, data, handlePostSendSMS);
                    break;
            }
        };
        const addEventLog= (next)=>{
            if (!isCommunicationSent){
                return next();
            }
            let evtLogData= {...EVENT.CUSTOMER_COMMUNICATOIN_SENT};
            evtLogData.desc= `triggered for ${evt} to ${MaskEmailsPhones(userMobile)}`;

            let evtLog= getEventInstance(by, evtLogData, doc);
            evtLog.save((err)=>{
                if (err){
                    return next(err);
                }
                doc.lastEvent= evtLog;
                doc.markModified('lastEvent');
                return next();
            });
        };

        const steps= [
            loadCustomer,
            loadOrgUnitInfo,
            sendEmail,
            sendSMS,
            addEventLog
        ];

        Async.series(steps, (err)=>{
            if(err){
                console.log('error sending pns to watchers', err);
                return;
            }
            console.log('successfully sent pns to watchers!');
            return ;
        });
    });

    schema.method('notifyWatchers', function (evt){
        const Settings= app.locals.Settings;
        if (!Settings.ticket.watchers.isEnabled){
            return;
        }
        const OrgUser = app.locals.models.OrgUser;
        const MainApp= app.locals.mainApp;
        const MainUser = MainApp.locals.models.User;
        const PushNotification = MainApp.locals.services.PushNotification;

        const clusterId= this.clusterId;
        let globalUserIds= [];
        let globalUsers= [];

        const loadOrgUnits = (next) =>{
            return next();
        };

        const loadOrgUnitManagers= (next) =>{
            return next();
        };

        const loadOrgUsers= (next) =>{
            OrgUser.distinct('globalUser._id', {clusterIds:{$in:[clusterId]}}, (err, userIds)=>{
                if (err){
                    return next();
                }
                globalUserIds= userIds;
                return next();
            })
        };

        const loadGlobalUsers= (next) =>{
            MainUser.find({_id: {$in: globalUserIds}}, (err, users)=>{
                if (err) {
                    return next(err);
                }
                globalUsers= users;
                return  next();
            });
        };

        const sendPNs= (next) =>{
            let message;
            let title;
            if (evt === 'CREATION'){
                title= 'Ticket Created';
            }
            else if (evt === 'CLOSURE'){
                title= 'Ticket Closed';
            }
            let view= {code: this.code, site: {...this.site}};
            message= JSONStringTemplater(NOTIFICATION_TEMPLATES[evt], view);
            const sendPN2User= (user, next2) =>{
                console.log(`${this.code} : About to send ${evt} PN to ${user.name} `);
                let token = '';
                if (user.primaryDevice && user.primaryDevice.firebaseRegistrationToken) {
                    token = user.primaryDevice.firebaseRegistrationToken
                }
                if (!token){
                    console.log(`${this.code} : User not registered for fcm : ${user.name}`);
                    return next2();
                }
                PushNotification.send(token,
                    {notification :{title, body:message}, data: {id:this._id.toString()}},
                    (err)=>{
                        if (err){
                            console.log(`${this.code} : error while sending push notification to ${user.name}`, err);
                        }
                        next2();
                    });
            }
            Async.eachSeries(globalUsers, sendPN2User, next);
        }

        const steps= [
            loadOrgUnits,
            loadOrgUnitManagers,
            loadOrgUsers,
            loadGlobalUsers,
            sendPNs
        ];

        Async.series(steps, (err)=>{
            if(err){
                console.log('error sending pns to watchers', err);
                return;
            }
            console.log('successfully sent pns to watchers!');
            return ;
        });
    });

    function getEventInstance(by, event, ticket, data) {
        const Event = app.locals.models.EventLog;
        let evt = new Event({
            evtType: event.code,
            name: event.name,   //verb
            desc : event.desc,  //rest of the part
            doneBy: {
                _id: by._id||by.id,
                name: by.name,
                code: by.code
            },
            scope:{
                sType:'ticket',
                _id: ticket._id,
                code: ticket.code
            },
            createdBy: by._id||by.id,
            when: new Date()
        });
        if(data?.loc){
            evt.loc= data.loc;
        }
        if (data?.client){
            evt.client= data.client;
        }
        return evt;
    }

    //Not used as of now. needed when offline comes into picture
    schema.method('log', function (by, a_evt, desc, argWhen, client, loc, details) {
        const EventLog = app.locals.models.EventLog;
        let log= new EventLog();
        let evt= {...a_evt},
            when= argWhen||new Date(),
            lscope= {
                _id :this._id,
                name: this.code,
                type: 'ticket'
            };
        let fillCurrentDateTime= function () {
            when= new Date();
            log.extras= {
                inconsistentWhen: when
            };
        };

        if (when){
            let valueOfWhen= Moment(when).valueOf();
            if (valueOfWhen > Moment().valueOf()){
                fillCurrentDateTime();
            }
            else if(this.lastEvent && this.lastEvent.when) {
                if (valueOfWhen < Moment(this.lastEvent.when).valueOf()) {
                    fillCurrentDateTime();
                }
            }
            else {
                if (valueOfWhen < Moment(this.createdOn).valueOf()){
                    fillCurrentDateTime();
                }
            }
        }

        evt.desc= desc;
        this.set('lastEvent', {
            doneBy          : {
                _id     : Mongoose.Types.ObjectId(by.id),
                name    : by.name
            },
            event       : evt,
            desc        : desc,
            details     : details,
            when        : when,
            client      : client,
        });

        return log;
    });

    schema.method('isActionValid', function (action) {
        if (this.status === TICKET_STATUS.CLOSED || this.status === TICKET_STATUS.CANCELLED ){
            return false;
        }
        return true;
    });

    schema.method('cancel', function(by, a_data, cb){
        let record  = this,
            data    = a_data||{};
        const checkActionValidity= (next)=>{
            if(!record.isActionValid('cancel')) {
                return next('Not a valid actions!');
            }
            return next();
        };

        const prepare = (next) => {
            record.status = TICKET_STATUS.CANCELLED;
            record.isCancelled = true;
            record.cancellationReason = data.cancellationReason;
            record.cancellationRemarks = data.cancellationRemarks;
            record.completedOn= new Date()
            return  next();
        };

        const addEventLog= (next)=>{
            let evtLog= getEventInstance(by, EVENT.CANCELLED, record, data);
            evtLog.save((err)=>{
                if (err){
                    return next(err);
                }
                record.lastEvent= evtLog;
                record.markModified('lastEvent');
                return next();
            });
        };

        const commit= (next)=>{
            return record.save(next);
        };

        const steps=[
            checkActionValidity,
            prepare,
            addEventLog,
            commit
        ];
        Async.series(steps, (err)=>{
            cb(err, record);
        });
    });

    //FIXME: Need to remove this
    schema.method("pause", function(by, a_data, cb){
        const SparePart = app.locals.models.SparePart;
        let record= this,
            data    = a_data||{},
            log;
        let exitF= function (err) {
            if (!err && log){
                // log.save(function(err){
                //     console.log(err);
                // });
            }
            if (cb){
                cb(err, record);
            }
        };

        if (!record.isActionValid("pause")){
            return exitF('not valid action');
        }

        let update= function (next) {
            record.status= "03_on_hold";
            record.pausedOn= new Date();
            for (var key in data){
                record[key]= data[key];
            }
            // log= record.log(by, EVENT.PAUSED, data.paused_reason, data.updated_date, data._client, data.location);
            record.save(next);
        };

        let populateSpares = function (next) {
            if (data.holdReason !== '01_spares_not_available'){
                delete data.sparesRequired;
                return next();
            }
            let sparesRequired= [];
            let spareQuantityMap= {};
            let spareIds = Lodash.map(data.sparesRequired, (val)=>{
                spareQuantityMap[val._id]= val.quantity;
                return Mongoose.Types.ObjectId(val._id);
            });
            SparePart.find({_id: {$in:spareIds}}, { name:1,code:1,listPrice:1 }, (err, spares)=>{
                if (err){
                    return next(err);
                }
                Lodash.map(spares,(sp)=>{
                    sparesRequired.push({
                        _id: sp._id,
                        name: sp.name,
                        code: sp.code,
                        quantity: spareQuantityMap[sp._id.toString()],
                        listPrice: sp.listPrice
                    });
                });
                data.sparesRequired= sparesRequired;
                return next();
            });
        };

        Async.series([populateSpares, update], exitF);
    });

    schema.method('setJobNotCompleted', function(by, data, cb){
        const SparePart = app.locals.models.SparePart;
        const Consumable= app.locals.models.Consumable;

        let partsRequired= [];
        let assetRecord;
        let record= this,
            evt;
        const meterTypeMap= {};

        const checkActionValidity= (next)=>{
            if(!record.isActionValid('pause')) {
                return next('not valid action - Job not completed');
            }
            return next();
        };
        const loadMeterTypesMaster = (next) =>{
            if (!data.meterReadings){
                return next();
            }
            const MeterType= app.locals.models.MeterType;
            MeterType.find({}, (err, types)=>{
                if (err){
                    return next();
                }
                types.forEach((type)=>{
                    meterTypeMap[type._id.toString()]= type;
                });
                return next();
            });
        };

        const updateAssetMeterReadings= (next) =>{
            if (!data.meterReadings){
                return next();
            }
            let readings= [];
            for (let meterTypeId in data.meterReadings){
                readings.push({
                    name: meterTypeMap[meterTypeId]?.name,
                    _id: meterTypeMap[meterTypeId]?._id,
                    id: meterTypeId,
                    reading: data.meterReadings[meterTypeId]
                });
            }
            data.meterReadings= [...readings];
            const Asset= app.locals.models.Asset;
            Asset.findById(this.asset._id, (err, asset)=>{
                if (err){
                    return next(err);
                }
                if (!asset){
                    console.log('asset for the ticket not found!');
                    return next();
                }
                asset.noteMeterReadings(by,readings, this, new Date(), (err)=>{
                    if(err){
                        return next(err);
                    }
                    assetRecord= asset;
                    data.meterReadings= [...readings];
                    asset.save(next);
                });
            });
        };

        const populateSparesAndConsumables = (next)=>{
            if (record.sType !== 'support'){
                return next();
            }
            const populateRecords= (type, next2) =>{
                if (!data[type.field]){
                    return next2();
                }
                let recordsRequired= [];
                let quantityMap= {};
                let ids = Lodash.map(data[type.field], (val)=>{
                    quantityMap[val.id]= val.quantity;
                    return Mongoose.Types.ObjectId(val.id);
                });
                const projection= { name:1,code:1,listPrice:1 };
                let partType= '';
                if (type.field==='sparesRequired'){
                    partType = 'sparePart';
                }
                else if (type.field === 'consumablesRequired'){
                    partType = 'consumable';
                }
                type.model.find({_id: {$in:ids}}, projection, (err, docs)=>{
                    if (err){
                        return next(err);
                    }
                    Lodash.map(docs, (doc)=>{
                        let partDetails= {
                            _id: doc._id,
                            name: doc.name,
                            code: doc.code,
                            listPrice: doc.listPrice,
                            quantity: quantityMap[doc._id.toString()]
                        };
                        recordsRequired.push(partDetails);
                        partsRequired.push({
                            partType,
                            ...partDetails
                        });
                    });
                    data[type.field]= recordsRequired;
                    return next2();
                });
            }
            Async.eachSeries([
                {model: SparePart, field:'sparesRequired'},
                {model:Consumable, field:'consumablesRequired'}
            ],
            populateRecords, next);
        };

        const populatePendingConsumableQuantity = (next) => {
            if (record.sType !== 'consumable_req') {
                return next();
            }
            let {pendingConsumableQuantity}= data;
            if (!pendingConsumableQuantity){
                return next();
            }
            let consumables= [];
            record.consumables.forEach((consumable)=>{
                consumable.pendingQuantity= pendingConsumableQuantity[consumable._id.toString()];
                consumables.push(consumable);
            });
            record.consumables= consumables;
            record.markModified('consumables');
            return next();
        };

        const update= function (next) {
            record.status= "03_on_hold";
            evt= EVENT.PAUSED;
            record.pausedOn= new Date();
            for (let key in data){
                record[key]= data[key];
                record.markModified(key);
            }
            log= record.log(by, EVENT.PAUSED, data.paused_reason, data.updated_date, data._client, data.location);
            if (partsRequired.length === 0) {
                return record.save(next);
            }

            const PartRequisition= app.locals.models.PartRequisition;
            const Settings= app.locals.Settings;
            if (Settings.ticket.closePartPending){
                evt= EVENT.CLOSED;
                record.status= TICKET_STATUS.CLOSED;
                record.completedOn= new Date();
            }
            PartRequisition.findOne({'sourceTicket._id': record._id}, (err, pr)=>{
                if (err){
                    return next(err);
                }
                if (!pr){
                    pr= new PartRequisition({
                        createdBy: by._id||by.id,
                        sourceTicket: {...record.getShortForm()}
                    });
                }
                if (assetRecord){
                    pr.asset= assetRecord.getShortForm();
                    pr.asset.customer= {...assetRecord.customer};
                    pr.markModified('asset');
                }
                pr.requester= {...record.assignee};
                pr.markModified('requester');
                pr.parts= [...partsRequired];
                pr.markModified('parts');
                pr.save((err)=>{
                    next();
                });
            });
        };

        const addEventLog= (next)=>{
            let evtLog= getEventInstance(by, {...evt}, record, data);
            evtLog.save((err)=>{
                if (err){
                    return next(err);
                }
                record.lastEvent= evtLog;
                record.markModified('lastEvent');
                return next();
            });
        };

        const commit= (next)=>{
            return record.save(next);
        };

        Async.series([
            loadMeterTypesMaster,
            updateAssetMeterReadings,
            populateSparesAndConsumables,
            populatePendingConsumableQuantity,
            update,
            addEventLog,
            commit
        ], (err)=>{
            cb(err, record);
        });
    });


    schema.method("updateDueDate", function(by, a_data, cb){
        let record= this,
            data    = a_data||{},
            log;
        let exitF= function (err) {
            if (!err && log){
                // log.save(function(err){
                //     console.log(err);
                // });
            }
            if (cb){
                cb(err, record);
            }
        };

        if (!record.isActionValid("updateDueDate")){
            return exitF('not valid action');
        }

        const update= function (next) {
            record.dueDate= new Date();
            for (let key in data){
                record[key]= data[key];
            }
            // log= record.log(by, EVENT.PAUSED, data.paused_reason, data.updated_date, data._client, data.location);
            record.save(next);
        };

        Async.series([update], exitF);
    });

    const TEXT_MAPPINGS= {
        "status": {
                "05_closed": "Closed",
                "01_open": "Open",
                "02_in_progress": "In Progress",
                "03_on_hold" : "Pending",
                "04_resolved" : "Resolved",
                "06_cancelled": "Cancelled"
        },
        "sType": {
            "breakdown": "Breakdown",
                "pm": "Preventive Maintenance",
                "pd": "Periodic Maintenance",
                "installation": "Installation",
                "inspection": "Inspection",
                "consumable_req": "Consumables Request",
                "support": "Support Request"
        },
        "source": {
            "customer_generated": "Customer",
            "help_desk_created": "Help Desk",
            "system_generated": "System"
        },
    };

    schema.virtual('abbrType').get(function() {
        return this.code.split('TKT')[0]||'BD';
    });
    schema.virtual('statusText').get(function() {
        return TEXT_MAPPINGS.status[this.status];
    });
    schema.virtual('sTypeText').get(function() {
        return TEXT_MAPPINGS.sType[this.sType];
    });
    schema.virtual('sourceText').get(function() {
        return TEXT_MAPPINGS.source[this.source];
    });
    schema.virtual('age').get(function (){
        let start = this.createdOn;
        let end;
        if ((this.status === '05_closed') || (this.status==='06_cancelled')){
            end= new Date(this.completedOn);
        }
        else {
            end= new Date();
        }
        let duration= ( end.valueOf()- new Date(start).valueOf());
        return Moment.duration(duration).format("d [days], h [hrs]");;
    });

    schema.virtual('access').get(function() {
        let actions= {...CollectionSettings.actions};
        if ((this.status === '05_closed') || (this.status==='06_cancelled')){
            actions= {};
        }
        else {
            const actionsDef= CollectionSettings.actionsDef||{};
            console.log('>>>>>>>>>>;', CollectionSettings.actionsDef);
            for (let actionId in actionsDef){
                let cond= actionsDef[actionId].cond||{};
                let isMatched= true;
                console.log(`>>>>> about evaluate condition for ${actionId}`);
                for(let fieldId in cond){
                    let fieldVal= this.get(fieldId);
                    console.log(`>>>>> ${fieldId}: ${fieldVal}, ${cond[fieldId]}`);
                    if (cond[fieldId] === '*'){
                        if (!fieldVal) {
                            isMatched = false;
                            break;
                        }
                    }
                    else {
                        if (fieldVal !== cond[fieldId]){
                            isMatched= false;
                            break;
                        }
                    }
                }
                actions[actionId]= isMatched;
            }
        }
        return actions;
    });

    schema.virtual('qMeta').get(function (){
        let qMeta= {};
        if (this.subType){
            qMeta= {
                code: {
                    routerLink: ["/", "ticket", "v2"]
                }
            }
        }
        return qMeta;
    });


    schema.set('toObject', {virtuals: true});
    schema.set('toJSON', {virtuals: true});

    schema.method('assign', function(by, assigneeId, cb, sendPN=true){
        const OrgUser = app.locals.models.OrgUser;
        const MainApp= app.locals.mainApp;
        const MainUser = MainApp.locals.models.User;
        const PushNotification = MainApp.locals.services.PushNotification;

        let record= this,
            technician,
            evt;

        const checkActionValidity= (next)=>{
            if(!record.isActionValid('assign')) {
                return next('Not a valid action: Assign');
            }
            return next();
        };

        const prepare=  (next) => {
            OrgUser.findById(assigneeId, function(err, assignee){
                if(err){
                    return next(err);
                }
                if (!assignee){
                    return next('Assignee not found!');
                }
                technician= assignee;
                if (!record.assignee?._id){
                    evt= EVENT.ASSIGNED;
                }
                else if (record.assignee._id.toString() !== assignee._id.toString()){
                    evt= EVENT.RE_ASSIGNED;
                }
                else {
                    evt= EVENT.RE_ASSIGNED//Ideally this should not be allowed.
                }
                record.assignedOn= new Date();
                record.set('assignee', assignee.getShortForm());
                record.markModified('assignee');
                return next();
            });
        }


        const addEventLog= (next)=>{
            let evtLog= getEventInstance(by, {...evt, desc: ' to '+record.assignee.name}, record);
            evtLog.save((err)=>{
                if (err){
                    return next(err);
                }
                record.lastEvent= evtLog;
                record.markModified('lastEvent');
                return next();
            });
        };

        const commit= (next)=>{
            return record.save(next);
        };

        const sendPushNotification =(next) =>{
            if (!sendPN){
                return next();
            }
            MainUser.findById(technician.globalUser._id, (err, mainUser)=>{
                if (err){
                    return next(err);
                }
                if (!mainUser){
                    console.log('user not found for sending pn');
                    return next();
                }
                let token = '';
                if (mainUser.primaryDevice && mainUser.primaryDevice.firebaseRegistrationToken) {
                    token = mainUser.primaryDevice.firebaseRegistrationToken
                }
                if (!token){
                    console.log("Technician not registered for fcm : "+mainUser.name);
                    return next();
                }
                let message= `Ticket ${record.code} is assigned to you`;
                PushNotification.send(token,
                    {notification :{title:'Ticket Assigned', body:message}, data: {id:record._id.toString()}},
                    (err)=>{
                        if (err){
                            console.log('error while sending push notification to ', mainUser.name);
                        }
                        next();
                    });
            });
        };

        const steps=[
            checkActionValidity,
            prepare,
            addEventLog,
            commit,
            sendPushNotification
        ];
        Async.series(steps, (err)=>{
            cb(err, record);
        });
    });

    schema.method("clearAssignee", function(){
        //FIXME: need to implement this fully, including adding event log
        this.set("assignee", undefined);
        this.markModified("assignee");
    });
    //@ENDOF : METHODS

    //@STARTOF : INDEXES
    schema.index({'asset._id': -1, sType:1, status:1, completedOn:-1} );
    schema.index({'asset.code': 1, lastModifiedOn: -1, dueDate: 1, createdOn: -1});
    schema.index({ code: 1, lastModifiedOn: -1, dueDate: 1, createdOn: -1});
    schema.index({ 'asset.serialNumber': 1, lastModifiedOn: -1, dueDate: 1, createdOn: -1});
    schema.index({ 'asset.secondaryCode': 1, lastModifiedOn: -1, dueDate: 1, createdOn: -1});
    schema.index({'asset.contract._id': 1, sType: 1, createdOn: 1});
    schema.index({sType: 1, lastModifiedOn: -1, dueDate: 1, createdOn: -1});
    schema.index({seqId: 1, lastModifiedOn: -1, dueDate: 1, createdOn: -1});
    schema.index({status:1, createdOn:1});
    schema.index({status:1, completedOn:1});
    schema.index({lastModifiedOn: -1, dueDate: 1, createdOn: -1});

    // schema.index({'asset._id': -1, sType:1} ,
    //     { unique: true, partialFilterExpression: { sType:'pm', status: { $in: ['01_open', '02_in_progress', '03_on_hold', '04_resolved'] } } });

    schema.index({sType:1, seqId: -1}, {unique: true});
    schema.index({code: 1}, {unique: true});
    schema.index({"contact.phoneNumber": 1});
    schema.index({"contact.altPhoneNumber": 1});
    schema.index({lastModifiedOn:1, dueDate:1, createdOn  : -1});
    schema.index({completedOn  : -1});
    schema.index({"asset._id": 1});
    schema.index({"customer._id": 1});
    schema.index({  //for ticket list from mobile
        "assignee._id"          : 1,
        "status"                : 1
    });
    schema.index({'asset._id': 1, 'sparesReplaced._id':1}); //used for part requisition details

    schema.index({"orgUnit._id": 1, "sType": 1, "status":1})
    schema.index({"sType": 1, "status":1})

    //@ENDOF : INDEXES

    schema.statics.startWork= function (by, id, data, cb) {
        this.findMustById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            for (let key in data){
                record[key]= data[key];
            }
            record.lastModifiedBy= by.id||by._id;
            record.status= TICKET_STATUS.IN_PROGRESS;
            record.startedOn= new Date();
            let evt= getEventInstance(by, EVENT.STARTED, record, data);
            evt.save((err)=>{
                record.lastEvent= evt;
                record.markModified('lastEvent');
                record.save((err, newDoc)=>{
                    if (err){
                        return cb(err);
                    }
                    cb(undefined, newDoc);
                });
            });
        });
    };

    schema.statics.finishWork= function (by, id, data, cb) {
        this.findMustById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            for (let key in data){
                record[key]= data[key];
            }
            record.lastModifiedBy= by;
            if ((record.status !== TICKET_STATUS.CLOSED) &&(record.status !== TICKET_STATUS.CANCELLED)){
                record.status= TICKET_STATUS.RESOLVED;
            }
            record.finishedOn= new Date();
            record.save((err, newDoc)=>{
                if (err){
                    return cb(err);
                }
                // record.notifyWatchers('CLOSURE');
                cb(undefined, newDoc);
            });
        });
    };


    schema.statics.assign= function (by, id, assigneeId, cb, sendPN) {
        this.findMustById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            record.assign(by, assigneeId, function (err) {
                return cb(err, record);
            }, sendPN);
        });
    };

    schema.statics.allocate= function (by, id, orgUnitId, cb) {
        this.findMustById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            record.allocate(by, orgUnitId, function (err) {
                return cb(err, record);
            });
        });
    };

    schema.statics.markPending= function (by, id, data, cb) {
        this.findMustById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            record.pause(by, data, function (err) {
                return cb(err, record);
            });
        });
    };

    schema.statics.updateDueDate= function (by, id, data, cb) {
        this.findMustById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            record.updateDueDate(by, data, function (err) {
                return cb(err, record);
            });
        });
    };

    schema.statics.findMustById= function(id, cb) {
        this.findById(id, (err,record) => {
            if(err){
                return cb(err);
            }
            if(!record) {
                return cb('Record not found');
            }
            return cb(undefined, record);
        });
    }

    schema.statics.cancel= function (by,id,data,cb) {
        this.findMustById(id, (err,record) => {
            if(err){
                return cb(err);
            }
            record.cancel(by, data, cb);
        });
    };

    schema.statics.close= function (by, id, data, cb) {
        const SparePart= app.locals.models.SparePart;
        const Consumable= app.locals.models.Consumable;
        this.findById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            if (!record){
                return cb('Record not found!');
            }
            if (!record.isActionValid('close')){
                return cb('not a valid action');
            }
            const updateClosureData = (next)=>{
                record.status =  TICKET_STATUS.CLOSED;
                if (data.media){
                    if (data.media.assetPhotoAtClosure) {
                        record.set('media.assetPhotoAtClosure', data.media.assetPhotoAtClosure);
                    }
                    if (data.media.customerSignature){
                        record.set('media.customerSignature', data.media.customerSignature);
                    }
                    if (data.media.technicianSignature){
                        record.set('media.technicianSignature', data.media.technicianSignature);
                    }
                    delete data.media;
                }
                for (let key in data){
                    record[key]= data[key];
                }
                record.completedOn = new Date();
                if (data.pmCheckList){
                    record.pmCheckList= data.pmCheckList;
                    record.markModified('pmCheckList');
                }
                return next();
            }

            const populateSpares =  (next) => {
                if(data.closure && data.closure.repairType !== 'part_replacement'){
                    delete data.sparesReplaced;
                    return next();
                }
                let sparesReplaced= [];
                let spareQuantityMap= {};
                let spareIds = Lodash.map(data.sparesReplaced, (val)=>{
                    let id= val.id||val._id;
                    spareQuantityMap[id]= val.quantity;
                    return Mongoose.Types.ObjectId(id);
                });
                SparePart.find({_id: {$in:spareIds}}, { name:1,code:1,listPrice:1 }, (err, spares)=>{
                    if (err){
                        return next(err);
                    }
                    Lodash.map(spares,(sp)=>{
                        sparesReplaced.push({
                            _id: sp._id,
                            name: sp.name,
                            code: sp.code,
                            listPrice: sp.listPrice,
                            quantity: spareQuantityMap[sp._id.toString()]
                        });
                    });
                    record.sparesReplaced= sparesReplaced;
                    record.markModified('sparesReplaced')
                    return next();
                });
            };
            let consumableQuantityMap= {};
            const populateConsumablesFulfilled =  (next) => {
                if(data.closure && data.closure.repairType !== 'part_replacement'){
                    delete data.consumablesFulfilled;
                    return next();
                }
                let consumablesFulfilled= [];
                let consumableIds = Lodash.map(data.consumablesFulfilled, (val)=>{
                    let id= val.id||val._id;
                    consumableQuantityMap[id]= val.quantity;
                    return Mongoose.Types.ObjectId(id);
                });
                Consumable.find({_id: {$in:consumableIds}}, { name:1,code:1,listPrice:1 }, (err, consumables)=>{
                    if (err){
                        return next(err);
                    }
                    Lodash.map(consumables,(consumable)=>{
                        consumablesFulfilled.push({
                            _id: consumable._id,
                            name: consumable.name,
                            code: consumable.code,
                            listPrice: consumable.listPrice,
                            quantity: consumableQuantityMap[consumable._id.toString()]
                        });
                    });
                    record.consumablesFulfilled= consumablesFulfilled;
                    record.markModified('consumablesFulfilled')
                    return next();
                });
            };

            const remainingConsumables= [];
            const checkPartialFulfillment = next =>{
                if (record.sType !== STYPE.CONSUMABLE_REQ){
                    return next();
                }
                let requestedConsumables= record.consumables;
                requestedConsumables.forEach((consumable)=>{
                    let fulfilledQuantity= consumableQuantityMap[consumable._id.toString()] || 0;
                    if (consumable.quantity > fulfilledQuantity) {
                        remainingConsumables.push({...consumable, consumable:consumable._id.toString()});
                        remainingConsumables[remainingConsumables.length-1].quantity= consumable.quantity-fulfilledQuantity;
                    }
                });
                return next();
            };

            const createTicket4RemainingQuantity= next =>{
                if (remainingConsumables.length === 0){
                    return next();
                }
                let consumableTicketData= {};
                let fields= [
                    'name',
                    'desc',
                    'sType',
                    'asset',
                    'contract',
                    'customer',
                    'contact',
                    'address',
                    'orgUnit',
                    'assignee'
                ]
                fields.forEach((field)=>{
                    if (record[field]){
                        if (typeof record[field] === 'object'){
                            consumableTicketData[field]= {...record[field]};
                        }
                        else {
                            consumableTicketData[field]= record[field];
                        }
                    }
                });
                consumableTicketData.customerId= record.customer._id;
                consumableTicketData.consumables= remainingConsumables;
                consumableTicketData.parentTicket= record.getShortForm();
                Ticket.create(by, consumableTicketData, (err, newTicket)=>{
                    if(err){
                        return next(err);
                    }
                    if (!newTicket) {
                        return next('Ticket could not be created with remaining quantities');
                    }
                    record.childTicket= newTicket.getShortForm();
                    record.isPartialFulfillment= true;
                    return next();
                });
            }
            const steps= [updateClosureData,
                populateSpares,
                populateConsumablesFulfilled,
                checkPartialFulfillment,
                createTicket4RemainingQuantity
            ];
            Async.series(steps, (err)=>{
                if (err){
                    return cb(err);
                }
                return record.save(cb);
            });
        });
    };

    schema.statics.mapAsset= function (by, id, data, cb) {
        let ticket, asset, productModel;
        const assetId= data.assetId;
        const Asset = app.locals.models.Asset;
        const Contract = app.locals.models.Contract;
        const ProductModel = app.locals.models.ProductModel;

        delete data.assetId;

        const loadTicket= (next) =>{
            this.findById(id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return  next('no ticket found!');
                }
                ticket= record;
                return next();
            })
        };

        const updateAssetInfo = (next) =>{
            const updateAsset = (next2) => {
                Asset.updateBasicDetails(by, assetId, data,(err,record) => {
                    if(err) {
                        return next2(err);
                    }
                    return next2();
                });
            };

            const loadAsset = (next2) => {
                Asset.findById(assetId,(err,record) => {
                    if(err) return next2(err);
                    asset = record;
                    ticket.asset = record.getShortForm();
                    return next2();
                });
            };

            const loadContract = next2 => {
                if (!asset.contract || !asset.contract._id){
                    return next2();
                }
                Contract.findById(asset.contract._id,(err,result) => {
                    if(err) return next2(err);
                    if(!result) return next2({ message: 'Contract Not Found' });
                    ticket.asset.contract = {
                        ...result.getShortForm(),
                        referenceNumber: result.referenceNumber,
                        status: result.status,
                        endDate: result.endDate
                    };
                    return next2();
                });
            };

            const loadProductModel = next2 => {
                ProductModel.findById(asset.model._id,(err,result) => {
                    if(err) return next2(err);
                    if(!result) return next2('No Product Found - map asset');
                    productModel = result.getShortForm();
                    productModel.meterTypes = result.meterTypes;
                    ticket.asset.model = productModel;
                    return next2();
                });
            };

            Async.series([
                updateAsset,
                loadAsset,
                loadContract,
                loadProductModel,
            ],next);
        };

        const save= (next) =>{
            ticket.markModified('asset');
            ticket.lastModifiedBy = by;
            ticket.save(function (err, record) {
                if (err){
                    console.log("err",err);
                    return next(err);
                }
                return next();
            });
        };

        Async.series([
                loadTicket,
                updateAssetInfo,
                save,
            ],
            function (err) {
                cb(err, ticket);
            });
    };

    schema.statics.getChargesInfo= function (by, id, data, cb) {
        const Customer= app.locals.models.Customer;
        const Contract= app.locals.models.Contract;
        const RateCard= app.locals.models.RateCard;
        const Product= app.locals.models.Product;
        const Consumable= app.locals.models.Consumable;
        const SparePart= app.locals.models.SparePart;
        const Service= app.locals.models.Service;

        this.findById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            if (!record){
                return cb("Record not found!");
            }

            let contract, customerRateCard, defaultRateCard, productCategory;
            let rateCardCode;
            const loadCustomer= (next)=>{
                let customerId= record.customer?._id;
                if (!customerId){
                    return next('not mapped to customer!');
                }
                Customer.findById(customerId, (err, doc)=>{
                    if (err){
                        return next(err);
                    }
                    if (!doc){
                        return next('customer not found');
                    }
                    rateCardCode= doc.rateCard?.code;
                    return next();
                });
            }

            const loadCustomerRateCard= (next)=>{
                if (!rateCardCode){
                    return next();
                }
                RateCard.findOne({code: rateCardCode}, (err, doc)=>{
                    if (err){
                        return next(err);
                    }
                    if (!doc){
                        return next('ratecard not setup/not found!');
                    }
                    customerRateCard= doc;
                    return next();
                });
            };

            const loadDefaultRateCard= (next)=>{
                if (customerRateCard?.isDefault) {
                    defaultRateCard= customerRateCard;
                    return next();
                }
                RateCard.findOne({isDefault: true}, (err, doc)=>{
                    if (err){
                        return next(err);
                    }
                    // if (!doc){
                    //     return next('Default ratecrd not setup/not found!');
                    // }
                    defaultRateCard= doc;
                    return next();
                });
            };

            const loadContract= (next)=>{
                let contractId= record.asset?.contract?._id;
                if (!contractId){
                    return next();
                }
                Contract.findById(contractId, {assets:0}, (err, doc)=>{
                    if (err){
                        return next(err);
                    }
                    if (!doc){
                        return next('contract not found!');
                    }
                    contract= doc;
                    return next();
                });
            };

            const loadProduct= (next) =>{
                let productId= record.asset?.model?.product?._id;
                if (!productId){
                    return next();
                }
                Product.findById(productId, (err, doc)=>{
                    if (err){
                        return next(err);
                    }
                    if (!doc){
                        return  next('product not found!');
                    }
                    productCategory= doc.category;
                    return next();
                });
            };

            let spares= [];
            let consumables= [];
            let services= [];
            const loadSparesInfo= (next)=> {
                let spareIds = Lodash.map(data.spareIds, (val) => {
                    return Mongoose.Types.ObjectId(val);
                });
                SparePart.find({_id: {$in: spareIds}}, {name: 1, code: 1, listPrice: 1}, (err, docs) => {
                    if (err){
                        return next(err);
                    }
                    spares= docs;
                    return next();
                });
            };

            const loadConsumablesInfo= (next)=> {
                let consumableIds = Lodash.map(data.consumableIds, (val) => {
                    return Mongoose.Types.ObjectId(val);
                });
                Consumable.find({_id: {$in: consumableIds}}, {name: 1, code: 1, listPrice: 1}, (err, docs) => {
                    if (err){
                        return next(err);
                    }
                    consumables= docs;
                    return next();
                });
            };

            const loadServicesInfo= (next)=> {
                let servicesIds = Lodash.map(data.serviceIds, (val) => {
                    return Mongoose.Types.ObjectId(val);
                });
                Service.find({_id: {$in: servicesIds}}, {name: 1, code: 1, listPrice: 1}, (err, docs) => {
                    if (err){
                        return next(err);
                    }
                    services= docs;
                    return next();
                });
            };

            let tasks= [
                loadCustomer,
                loadCustomerRateCard,
                loadDefaultRateCard,
                loadContract,
                loadProduct,
                loadSparesInfo,
                loadConsumablesInfo,
                loadServicesInfo
            ];

            Async.series(tasks, (err)=>{
                if (err){
                    return cb(err);
                }
                return cb(undefined, {
                    id: record._id,
                    ...record.toObject(),
                    contract,
                    customerRateCard,
                    defaultRateCard,
                    productCategory,
                    consumables,
                    spares,
                    services
                })
            });
        });
    };

    schema.statics.setOnHold= function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            if (!record){
                return cb("Record not found!");
            }
            record.setJobNotCompleted(by, data, function (err) {
                return cb(err, record);
            });
        });
    };

    schema.statics.quickClose= function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            if (!record){
                return cb("Record not found!");
            }

            if (!record.isActionValid('close')){
                return cb('not a valid action!');
            }
            let updatedDoc;
            const addEventLog= (next)=>{
                let evtLog= getEventInstance(by, EVENT.CLOSED, record, data);
                evtLog.save((err)=>{
                    if (err){
                        return next(err);
                    }
                    record.lastEvent= evtLog;
                    record.markModified('lastEvent');
                    return next();
                });
            };

            const updateRecord= (next) =>{
                for (let key in data){
                    record[key]= data[key];
                }
                record.lastModifiedBy= by.id||by._id;
                record.status= TICKET_STATUS.CLOSED;
                record.completedOn= new Date();
                record.save((err, newDoc)=>{
                    if (err){
                        return next(err);
                    }
                    record.notifyWatchers('CLOSURE');
                    record.notifyCustomer('CLOSURE', by);
                    updatedDoc= newDoc;
                    next();
                });
            };
            Async.series([addEventLog, updateRecord], (err)=>{
                cb(err, updatedDoc);
            });
        });
    };

    schema.statics.quickUpdate= function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            if (!record){
                return cb("Record not found!");
            }
            for (let key in data){
                if (typeof data[key] === 'object'){
                    if (record[key]){
                        for (let subKey in data[key]){
                            record[key][subKey]= data[key][subKey];
                        }
                    }
                    else {
                        record[key]= data[key];
                    }
                }
                else {
                    record[key]= data[key];
                }
                record.markModified(key);
            }
            record.lastModifiedBy= by.id||by._id;
            record.save((err, newDoc)=>{
                if (err){
                    return cb(err);
                }
                record.notifyCustomer('UPDATE', by);
                cb(undefined, newDoc);
            });
        });
    };

    schema.statics.closeV2= function (by, id, data, cb) {
        const SparePart= app.locals.models.SparePart;
        const Consumable= app.locals.models.Consumable;

        this.findMustById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            if (!record.isActionValid('close')){
                return cb('not a valid action');
            }
            const updateClosureData = (next)=>{
                record.status =  TICKET_STATUS.CLOSED;
                if (data.media){
                    if (data.media.assetPhotoAtClosure) {
                        record.set('media.assetPhotoAtClosure', data.media.assetPhotoAtClosure);
                    }
                    if (data.media.assetPhoto1AtClosure) {
                        record.set('media.assetPhoto1AtClosure', data.media.assetPhoto1AtClosure);
                    }
                    if (data.media.customerSignature){
                        record.set('media.customerSignature', data.media.customerSignature);
                    }
                    if (data.media.technicianSignature){
                        record.set('media.technicianSignature', data.media.technicianSignature);
                    }
                    if (data.media.documentAtClosure){
                        record.set('media.documentAtClosure', data.media.documentAtClosure);
                    }
                    delete data.media;
                }
                for (let key in data){
                    record[key]= data[key];
                }
                record.completedOn = new Date();
                if (data.pmCheckList){
                    record.pmCheckList= data.pmCheckList;
                    record.markModified('pmCheckList');
                }
                if (data.pdCheckList){
                    record.pmCheckList= data.pdCheckList;
                    record.markModified('pmCheckList');
                }
                if (data.bdCheckList){
                    record.pmCheckList= data.bdCheckList;
                    record.markModified('pmCheckList');
                }
                return next();
            }

            const populateSpares =  (next) => {
                if (!data.sparesReplaced){
                    return next();
                }
                let sparesReplaced= [];
                let spareQuantityMap= {};
                let spareIds = Lodash.map(data.sparesReplaced, (val)=>{
                    let id= val._id||val.id;
                    spareQuantityMap[id]= val.quantity;
                    return Mongoose.Types.ObjectId(id);
                });
                SparePart.find({_id: {$in:spareIds}}, { name:1,code:1,listPrice:1 }, (err, spares)=>{
                    if (err){
                        return next(err);
                    }
                    Lodash.map(spares,(sp)=>{
                        sparesReplaced.push({
                            _id: sp._id,
                            name: sp.name,
                            code: sp.code,
                            listPrice: sp.listPrice,
                            quantity: spareQuantityMap[sp._id.toString()]
                        });
                    });
                    record.sparesReplaced= sparesReplaced;
                    record.markModified('sparesReplaced')
                    return next();
                });
            };
            let consumableQuantityMap= {};
            const populateConsumablesFulfilled =  (next) => {
                if (!data.consumablesFulfilled){
                    return next();
                }
                let consumablesFulfilled= [];
                let consumableIds = Lodash.map(data.consumablesFulfilled, (val)=>{
                    let id=val._id||val.id
                    consumableQuantityMap[id]= val.quantity;
                    return Mongoose.Types.ObjectId(id);
                });
                Consumable.find({_id: {$in:consumableIds}}, { name:1,code:1,listPrice:1 }, (err, consumables)=>{
                    if (err){
                        return next(err);
                    }
                    Lodash.map(consumables,(consumable)=>{
                        consumablesFulfilled.push({
                            _id: consumable._id,
                            name: consumable.name,
                            code: consumable.code,
                            listPrice: consumable.listPrice,
                            quantity: consumableQuantityMap[consumable._id.toString()]
                        });
                    });
                    record.consumablesFulfilled= consumablesFulfilled;
                    record.markModified('consumablesFulfilled')
                    return next();
                });
            };

            const remainingConsumables= [];
            const checkPartialFulfillment = next =>{
                if (record.sType !== STYPE.CONSUMABLE_REQ){
                    return next();
                }
                let requestedConsumables= record.consumables;
                requestedConsumables.forEach((consumable)=>{
                    let fulfilledQuantity= consumableQuantityMap[consumable._id.toString()] || 0;
                    if (consumable.quantity > fulfilledQuantity) {
                        remainingConsumables.push({...consumable, consumable:consumable._id.toString()});
                        remainingConsumables[remainingConsumables.length-1].quantity= consumable.quantity-fulfilledQuantity;
                    }
                });
                return next();
            };

            const createTicket4RemainingQuantity= next =>{
                if (remainingConsumables.length === 0){
                    return next();
                }
                let consumableTicketData= {};
                let fields= [
                    'name',
                    'desc',
                    'sType',
                    'asset',
                    'contract',
                    'customer',
                    'contact',
                    'address',
                    'orgUnit',
                    'assignee'
                ]
                fields.forEach((field)=>{
                    if (record[field]){
                        if (typeof record[field] === 'object'){
                            consumableTicketData[field]= {...record[field]};
                        }
                        else {
                            consumableTicketData[field]= record[field];
                        }
                    }
                });
                consumableTicketData.customerId= record.customer._id;
                consumableTicketData.consumables= remainingConsumables;
                consumableTicketData.parentTicket= record.getShortForm();
                Ticket.create(by, consumableTicketData, (err, newTicket)=>{
                    if(err){
                        return next(err);
                    }
                    if (!newTicket) {
                        return next('Ticket could not be created with remaining quantities');
                    }
                    record.childTicket= newTicket.getShortForm();
                    record.isPartialFulfillment= true;
                    return next();
                });
            };

            const meterTypeMap= {};
            const loadMeterTypesMaster = (next) =>{
                if (!data.meterReadings){
                    return next();
                }
                const MeterType= app.locals.models.MeterType;
                MeterType.find({}, (err, types)=>{
                    if (err){
                        return next();
                    }
                    types.forEach((type)=>{
                        meterTypeMap[type._id.toString()]= type;
                    });
                    return next();
                });
            };

            const updateAssetMeterReadings= (next) =>{
                if (!data.meterReadings){
                    return next();
                }
                let readings= [];
                for (let meterTypeId in data.meterReadings){
                    readings.push({
                        name: meterTypeMap[meterTypeId]?.name,
                        _id: meterTypeMap[meterTypeId]?._id,
                        id: meterTypeId,
                        reading: data.meterReadings[meterTypeId]
                    });
                }
                data.meterReadings= [...readings];
                if (!this.asset){
                    return next();
                }
                const Asset= app.locals.models.Asset;
                Asset.findById(this.asset._id, (err, asset)=>{
                    if (err){
                        return next(err);
                    }
                    if (!asset){
                        console.log('asset for the ticket not found!');
                        return next();
                    }
                    asset.noteMeterReadings(by,readings, this, new Date(), (err)=>{
                        if(err){
                            return next(err);
                        }
                        asset.save(next);
                    });
                });
            };

            const notifyCustomer= (next) =>{
                record.notifyCustomer('CLOSURE', by);
                return next();
            };

            const addEventLog= (next)=>{
                let evtLog= getEventInstance(by, EVENT.CLOSED, record, data);
                evtLog.save((err)=>{
                    if (err){
                        return next(err);
                    }
                    record.lastEvent= evtLog;
                    record.markModified('lastEvent');
                    return next();
                });
            };

            const steps= [
                loadMeterTypesMaster,
                updateAssetMeterReadings,
                updateClosureData,
                populateSpares,
                populateConsumablesFulfilled,
                checkPartialFulfillment,
                createTicket4RemainingQuantity,
                notifyCustomer,
                addEventLog
            ];
            Async.series(steps, (err)=>{
                if (err){
                    return cb(err);
                }

                record.save((err)=>{
                    cb(err, record);
                });
            });
        });
    };

    schema.statics.create= function (by, data, cb, isBulk=false) {
        const Settings= app.locals.Settings;
        const isAutoAssignmentEnabled= Settings.ticket.autoAssignment.isEnabled;
        const self= this;
        let record;
        let technician;
        if (!data.sType) {
            data.sType = STYPE.SUPPORT;
        }
        if (data.subType && !data.name){
            data.name= data.subType;
        }

        const prepare= (next) =>{
            data.createdBy= by.id||by._id;
            data.charges= {
                service: 0,
                installation: 0,
                inspection: 0
            };

            if (!data.name){
                data.name= data.desc;
            }
            if (data.name && (data.name !== data.desc)){
                data.desc= [data.name, data.desc].join('. ');
            }
            if (data.asset?.model?.['$init']){
                delete  data.asset?.model?.['$init']
            }
            record= new self(data);
            return next();
        };

        const loadOrgUnit= (next)=>{
            if (!data.orgUnitId){
                return next();
            }
            const OrgUnit= app.locals.models.OrgUnit;
            OrgUnit.findById(data.orgUnitId, (err, doc)=>{
                if (err){
                    return next();
                }
                if (!doc){
                    console.log('could not find orgunit');
                    return next();
                }
                data.orgUnit= doc.getShortForm();
                data.orgUnitIds= [doc._id];
                if (doc.parent?._id){
                    data.orgUnitIds.push(doc.parent?._id);
                }
                return next();
            });
        };

        const addEventLog= (next)=>{
            let evtLog= getEventInstance(by, EVENT.CREATED, record, data);
            evtLog.save((err)=>{
                if (err){
                    return next(err);
                }
                record.lastEvent= evtLog;
                record.markModified('lastEvent');
                return next();
            });
        };

        const commit= (next)=>{
            return record.save(next);
        };

        const populateCustomer= next => {
            const Customer= app.locals.models.Customer;
            if (data.asset && data.asset._id){
                return next();
            }
            if (!data.customerId){
                return next();
            }

            Customer.findById(data.customerId, (err, customer)=>{
                if (err){
                    return next(err);
                }
                if (!customer){
                    return next('Customer not found!');
                }
                data.customer= customer.getShortForm();
                if (!data.contact || !data.contact.phoneNumber){
                    data.contact = {...customer.contact};
                }
                return next();
            });
        }

        const populateCustomerAsset = next => {
            const Asset = app.locals.models.Asset;
            if (!data.asset ||!data.asset._id){
                return next();
            }
            Asset.findById(data.asset._id, (err,asset) => {
                if(err) {
                    return next(err);
                }
                if(!asset) {
                    return next({message: 'asset not found!'});
                }
                data.asset= {...asset.getShortForm()};
                data.customer = asset.customer;
                data.customerId= data.customer?._id;
                data.address = asset.address;
                if (asset.sku){
                    data.sku= {...asset.sku};
                    delete data.sku.attrs['$init'];
                }
                if (asset.contract){
                    data.asset.contract = {...asset.contract};
                }
                if (asset.orgUnit){
                    data.orgUnit= {...asset.orgUnit};
                }
                if (asset.technician && isAutoAssignmentEnabled){
                    technician= {...asset.technician};
                }
                return next();
            });
        };

        const loadContract = next => {
            if (!data.asset){
                return next();
            }
            if (!data.asset.contract) {
                return next();
            }
            if (!data.asset.contract._id){
                delete data.asset.contract;
                return next();
            }
            const Contract = app.locals.models.Contract;
            Contract.findById(data.asset.contract._id,(err,record) => {
                if(err) {
                    return next(err);
                }
                if(!record) {
                    return next({ message: 'Contract Not Found' });
                }
                data.asset.contract = {
                    ...record.getShortForm(),
                    referenceNumber: record.referenceNumber,
                    status: record.status,
                    endDate: record.endDate,
                    cType: record.cType,
                    freeConsumables: record.freeConsumables,
                    chargeableSpareParts: record.chargeableSpareParts,
                    discounts: record.discounts
                };
                return next();
            });
        };

        const loadProductModel = (next) => {
            if (!data.asset || !data.asset._id){
                return next();
            }
            if(data.sku){
                return  next();
            }
            const ProductModel = app.locals.models.ProductModel;
            ProductModel.findById(data.asset.model._id,(err,record) => {
                if(err) {
                    return next(err);
                }
                if(!record) {
                    return next('No Product Found');
                }
                let productModel = record.getShortForm();
                productModel.meterTypes = record.meterTypes;
                data.asset.model = productModel;
                return next();
            });
        };

        let generateTicketId= (next) =>{
            let sType= data.sType;
            let seqCounterId= [COLLECTION_NAME, sType].join('-');
            if (sType === STYPE.SUPPORT){
                seqCounterId= 'ticket';
            }
            Counter.getNextSequence(seqCounterId, (err, {seqId, code})=>{
                if (err){
                    return next(err);
                }
                data.seqId= seqId;
                data.code = code;
                return next();
            });
        };

        const populateConsumables = (next) =>{
            if (!data.consumables){
                return next();
            }
            const Consumable =app.locals.models.Consumable;
            let consumablesRequested= [];
            let consumableQuantityMap= {};
            let consumableIds = Lodash.map(data.consumables, (val)=>{
                if (!val){
                    return ;
                }
                consumableQuantityMap[val.consumable]= val.quantity;
                return Mongoose.Types.ObjectId(val.consumable);
            });
            Consumable.find({_id: {$in:consumableIds}}, { name:1,code:1,listPrice:1 }, (err, consumables)=>{
                if (err){
                    return next(err);
                }
                Lodash.map(consumables,(consumable)=>{
                    consumablesRequested.push({
                        _id: consumable._id,
                        name: consumable.name,
                        code: consumable.code,
                        listPrice: consumable.listPrice,
                        quantity: consumableQuantityMap[consumable._id.toString()]
                    });
                });
                data.consumables= consumablesRequested;
                return next();
            });
        };

        const loadRateCard = next => {
            const RateCard = app.locals.models.RateCard;
            RateCard.findById(data.rateCard, (err,doc) => {
                if(err) {
                    return next(err);
                }
                if (!doc){
                    console.log('Selected rate card not found!');
                    return next();
                }
                data.rateCard = doc.getShortForm();
                return next();
            });
        };

        const loadSKU= (next) =>{
            if (!data.skuId){
                return next();
            }
            const SKU= app.locals.models.SKU;
            SKU.findById(data.skuId, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('sku not found'+data.skuId);
                }
                data.sku= {...record.getShortForm(), displayName: record.displayName};
                return next();
            });
        };

        let clusterId;
        const loadSite= (next)=>{
            if (!data.siteId){
                return next();
            }
            const Site= app.locals.models.Site;
            Site.findById(data.siteId, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('site not found'+data.skuId);
                }
                data.site= {...record.getShortForm()};
                clusterId= record.clusterId;
                data.address = {...record.address};
                data.clusterId= clusterId;
                if (!data.contact){
                    if(record.contact){
                        data.contact={...record.contact};
                    }
                }
                return next();
            });
        };

        const loadWatchers= (next)=>{
            if (!data.siteId){
                return next();
            }
            const Site= app.locals.models.Site;
            Site.findById(data.siteId, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('site not found'+data.skuId);
                }
                data.site= {...record.getShortForm()};
                clusterId= record.clusterId;
                data.clusterId= clusterId;
                return next();
            });
        };

        let calculateCharges =  (next) => {
            //FIXME: Calculate from RateCard/Contract
            return next();
            // const RateCard = app.locals.models.RateCard;
            // const rateCard = data.rateCard;
            // if (rateCard){

            // }
        };

        const assignTechnician = (next)=>{
            let technicianId= data.technicianId;
            if (technicianId){
                technicianId= Mongoose.Types.ObjectId(data.technicianId);
            }
            else if(technician) {
                technicianId= technician._id;
            }
            if (!technicianId){
                return next();
            }
            record.assign(by, technicianId, next, !isBulk);
        };

        const notifyWatchers= (next) =>{
            record.notifyWatchers('CREATION');
            return next();
        };

        const notifyCustomer= (next) =>{
            record.notifyCustomer('CREATION', by);
            return next();
        };

        Async.series([
                generateTicketId,
                populateCustomerAsset,
                loadContract,
                loadProductModel,
                populateConsumables,
                populateCustomer,
                loadRateCard,
                loadSKU,
                loadSite,
                loadOrgUnit,
                loadWatchers,
                prepare,
                addEventLog,
                commit,
                calculateCharges,
                assignTechnician,
                notifyWatchers,
                notifyCustomer
            ],
            function (err) {
                cb(err, record);
        });
    };

    schema.statics.mapLocation= function (by, id, data, cb){
        let ticket;
        let asset;
        let assignee;
        const loadTicket= (next)=>{
            const Ticket = app.locals.models.Ticket;
            Ticket.findById(id, (err, record)=>{
                if (err) {
                    return next(err);
                }
                if (!record){
                    return next('Ticket not found!');
                }
                ticket= record;
                return next();
            });
        };

        const loadAsset = (next)=>{
            const Asset = app.locals.models.Asset;
            if (!ticket.asset || !ticket.asset._id){
                return next();
            };
            Asset.findById(ticket.asset._id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next();
                }
                asset= record;
                return next();
            });
        };

        const loadUser= (next) =>{
            const OrgUser= app.locals.models.OrgUser;
            if (!ticket.assignee || !ticket.assignee._id){
                return next();
            }
            OrgUser.findById(ticket.assignee._id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('Assignee not found!');
                }
                assignee= record;
                return next();
            })
        }

        let loc= data.loc;

        const saveAsset= (next)=>{
            if (!asset){
                return next();
            }
            if (!loc){
                return next();
            }
            asset.latestLoc= {...loc};
            asset.save(next);
        };

        const saveUser= (next)=>{
            if (!assignee){
                return next();
            }
            if (!loc){
                return next();
            }
            assignee.latestLoc  =  {...loc};
            assignee.save(next);
        }

        Async.series([loadTicket, loadAsset, loadUser, saveAsset,saveUser], (err)=>{
            if (err){
                console.log('error while saving location!', err);
            }
            return cb && cb(err);
        });
    }

    schema.statics.sync = function(coll, dupRecord, cb) {
        let cond= {}, updateValues= {};
        if (this.status === '05_closed'){
            return cb();
        }
        if (coll === 'customer') {
            cond['customer._id']= dupRecord._id;
            updateValues= {
                customer: {
                    ...dupRecord.getShortForm(),
                    secondaryCode: dupRecord.secondaryCode
                }
            };
        }
        else if (coll === 'asset') {
            cond['asset._id']= dupRecord._id;
            updateValues= {
                asset: {
                    ...dupRecord.getShortForm(),
                    serialNumber: dupRecord.serialNumber,
                    model:{...dupRecord.model},
                    contract: {...dupRecord.contract}
                }
            };
            if (dupRecord.technician){
                updateValues.assignee= {...dupRecord.technician};
            }
        }
        else if (coll === 'contract') {
        }
        //FIXME: add product and model update sync as well
        //NOTE: Don't do update on each of the record, as that will trigger infinite loop, with post save called
        this.updateMany(cond, {$set:updateValues}, {}, cb);
    };

    schema.statics.generateJobSheet= function (by, id, data, cb){
        const Ticket = this;

        const orgSeqId = app.locals.id;
        let outDir = app.locals.dirs.tickets;
        let fileName= 'job-sheet';
        let htmlOutput= '';
        let jobSheetUrl= '';
        let ticket;

        const loadTicket= (next) =>{
            Ticket.findById(id, (err, record)=>{
                if(err){
                    return next(err);
                }
                ticket= record;
                outDir+= '/'+ticket.code;
                mkdirpSync(outDir);
                fileName= `job-sheet-${ticket.code}`;
                jobSheetUrl= `/data/org/${orgSeqId}/tickets/${ticket.code}/${fileName}.html`
                return  next();
            });
        }
        const generateHtml = (next) =>{
            const Settings= app.locals.Settings;
            let htmlFile = `${outDir}/${fileName}.html`;
            let data = {};
            let options = {};
            let materialsRequired= [];
            let counter=0;

            (ticket.sparesRequired||[]).forEach((spare)=>{
                counter++;
                materialsRequired.push({
                    serial: counter,
                    name: spare.name,
                    quantity: spare.quantity
                });
            });
            (ticket.consumablesRequired||[]).forEach((consumable)=>{
                counter++;
                materialsRequired.push({
                    serial: counter,
                    name: consumable.name,
                    quantity: consumable.quantity
                });
            });

            if (Settings.legalName){
                data.orgUnit= {
                    legalName: Settings.legalName,
                    registeredAddress: Settings.registeredAddress
                }
            }
            const DateTime = app.locals.services.DateTime;
            data.materialsRequired= materialsRequired;
            data.logo= Settings.logo;
            data.baseUrl = app.locals.credentials.baseUrl;
            data.baseUrl= data.baseUrl.substr(0,data.baseUrl.length-1);
            data.title= `Material Requisition Form - ${ticket.code}`;
            data.ticket= {
                code: ticket.code,
                remarks: ticket.holdRemarks,
                requestDate: Moment(ticket.lastModifiedOn).format('DD-MMM-YYYY'),
                completedOn: Moment(ticket.completedOn).format('DD-MMM-YYYY'),
                creationDateTime: DateTime.getMoment(ticket.createdOn).format('hh:mm A DD-MMM-YYYY'),
                completedDateTime: DateTime.getMoment(ticket.completedOn).format('hh:mm A DD-MMM-YYYY')
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
            data.desc= ticket.desc;
            if (ticket.closure){
                data.remarks= ticket.closure.remarks;
                data.jobDone= ticket.closure.jobDone;
                data.repairType= ticket.closure.repairType;
                data.resolution= ticket.closure.actions? ticket.closure.actions.join(','): ticket.closure.reason;
            }

            if (ticket.asset){
                data.asset= {
                    name: ticket.asset.name,
                    serialNumber: ticket.asset.serialNumber,
                    secondaryCode: ticket.asset.secondaryCode
                }
                if(ticket.asset.contract?._id){
                    data.contract= {
                        ...ticket.asset.contract
                    };
                    data.contract.endDate= Moment(data.contract.endDate).format('DD-MMM-YYYY');
                }
                else {
                    data.contract= {};
                }
            }
            data.bill= ticket.bill;
            if (!data.bill || !Settings.finance.isEnabled){
                data.bill= {items: []};
                if (ticket.sparesReplaced){
                    data.bill.items= [...ticket.sparesReplaced];
                }
                if (ticket.consumablesFulfilled){
                    data.bill.items= [...data.bill.items, ...ticket.consumablesFulfilled]
                }
            }
            data.media= ticket.media;
            data.meterReadings= [...ticket.meterReadings];

            jobSheetUrl= data.baseUrl+ jobSheetUrl;

            EJS.renderFile('tpls/html/job-sheet.ejs', data, options, (err, tplOutput)=>{
                if(err){
                    return next(err);
                }
                htmlOutput= tplOutput;
                FS.writeFile(htmlFile, htmlOutput, 'utf8', next);
            });
        };

        Async.series([loadTicket, generateHtml], (err)=>{
            if (err){

                return cb(err);
            }
            cb(undefined, {...ticket.toObject(), jobSheetUrl});
        });
    }

    const Ticket = Db.model('ticket', schema);
    app.locals.models.Ticket = Ticket;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    const initCounter = (sType, next) =>{
        let seqCounterId= [COLLECTION_NAME, sType].join('-');
        if (sType === STYPE.SUPPORT){
            seqCounterId= 'ticket';
        }
        Counter.initCounter(sysUser._id, seqCounterId, 0, {prefix:STYPE_PREFIX[sType], padding:6}, (err)=>{
            next(err);
        });
    };
    Async.eachSeries( Object.keys(STYPE_PREFIX), initCounter, ()=>{
        Ticket.syncIndexes();
        doneCb();
    });

};
