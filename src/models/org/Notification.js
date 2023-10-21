const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Async = require('async');
const Moment= require('moment');

const Utils = require('../utils');
const JSONStringTemplater = require("json-templater/string");
const K = require("../../K");
const CollSchemaShort = Utils.CollSchemaShort;
const ContactSchema= Utils.ContactSchema;

const COLLECTION_NAME = 'notification';

module.exports = function (app, doneCb) {

    const SEQ_ID_PADDING= 6;
    const SEQ_CODE_PREFIX= 'NOT';

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;

    const schemaObj = new Schema({
        name: {
            type: String,
            required: true,
            trim: true
            //TODO: Derive this based on entity and action
        },
        code: {
            type: String,
            // required: true
        },
        seqId: {
            type: Number,
            // required: true
        },
        paddedSeqId: {
            type: String,
            index: true
        },
        desc: {
            type: String,
            trim: true,
        },
        sentAt: {
            type: String,   //YYYY-MM-DD
        },
        thumbnailUrl: {
            type: String
        },
        receiver: {...CollSchemaShort},
        sender: {...CollSchemaShort},
        entity: {...CollSchemaShort},
        entityType: {
            type: String,
            required: true,
            enum: ['ticket', 'campaign']
        },

        enquiryId: {
            type: ObjectId
        },
        // action: {   //based on entity
        //     type: String,
        //     enum: [
        //         'assign'
        //     ]
        // },
        customer : {
            title: {
                type: String,
                // enum: ['Mr', 'Ms', 'Mrs','Dr']
            },
            name: {
                type: String
            },
            contact: {...ContactSchema}
        },
        triggeredAt: {
            type: Date
        },
        lastOpenedAt: {
            type: Date
        },
        prevOpenedAt: [Date],
        channel: {
            type: String,
            enum: ['sms', 'webNotification']
        },
        status: {
            type: String,
            default: 'queued',
            enum: ['queued', 'triggered', 'unread', 'delivered', 'read']
        }
    });

    schemaObj.virtual('shortUrl').get(function (){
        return `${app.locals.credentials.baseUrl}s/${this.paddedSeqId}`;
    });

    schemaObj.virtual('publicUrl').get(function() {
        const orgSeqId = app.locals.id;
        let baseUrl;
        let appPrefix= 'appv2'
        baseUrl = `${app.locals.credentials.baseUrl}${appPrefix}/open/org`;
        return `${baseUrl}/${orgSeqId}/n/${this.paddedseqId}`;
    });


    schemaObj.statics.QFindById= function (id) {
        return new Promise((resolve, reject) => {
            const ObjectId = Mongoose.Types.ObjectId;
            if (ObjectId.isValid(id)){
                this.findById(id)
                    .then((doc) => {
                        resolve(doc);
                    })
                    .catch((err) => {
                        reject(err);
                    });
            }
            else {
                this.findOne({paddedSeqId:id})
                    .then((doc) => {
                        resolve(doc);
                    })
                    .catch((err) => {
                        reject(err);
                    });
            }

        });
    };


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
                this.paddedSeqId= 's'+paddedSeqId; //to make sure it is treated as string everywhere
                return next2();
            });
        };
        if (this.runStartAt && this.runEndAt){
            this.runDuration= Moment(this.runEndAt).diff(this.runStartAt, 's');
        }

        Async.series([genSeqId], done);
    });


    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let conditions = {'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')}};
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
        if(query.receiverId){
            query['receiver._id']= Mongoose.Types.ObjectId(query.receiverId);
            delete query.receiverId;
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

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name,
        };
    };

    schemaObj.methods.send= function (by, data, cb){
        const MainApp= app.locals.mainApp;
        const MainUser = MainApp.locals.models.User;
        const PushNotification = MainApp.locals.services.PushNotification;
        const OrgUser= app.locals.models.OrgUser;

        let globalUser;
        let orgUser;

        const loadOrgUser= (next)=>{
            if (!this.receiver?._id){
                return next();
            }
            OrgUser.findById(this.receiver._id, (err, record)=>{
                if (err){
                    return next();
                }
                orgUser= record;
                return next();
            });
        };

        const loadGlobalUser= (next) =>{
            if (!this.receiver?._id){
                return next();
            }
            MainUser.findById(orgUser.globalUser._id, (err, user)=>{
                if (err) {
                    return next(err);
                }
                globalUser= user;
                return  next();
            });
        };

        const sendPN= (next) =>{
            if (this.channel !== 'webNotification'){
                return next();
            }
            // let view= {code: this.code, site: {...this.site}};
            // message= JSONStringTemplater(NOTIFICATION_TEMPLATES[evt], view);
            let message= this.name;
            let token = '';
            let title= 'Message from TOYOTA ';
            if (globalUser.primaryDevice && globalUser.primaryDevice.firebaseRegistrationToken) {
                token = globalUser.primaryDevice.firebaseRegistrationToken
            }
            if (!token){
                console.log("User not registered for fcm : "+globalUser.name);
                return next();
            }
            PushNotification.send(token,
                {
                    notification: {
                        title,
                        body: message
                    },
                    data: {
                        entityType: this.entityType,
                        entityId: this.entity._id.toString()
                    }
                },
                (err)=>{
                    if (err){
                        console.log(err);
                        console.log('error while sending push notification to ', globalUser.name);
                    }
                    next();
                });
        };

        const sendSMS= (next)=>{
            if (this.channel !== 'sms'){
                return next();
            }
            const customerMobileNumber= this.customer.contact.phoneNumber;
            const ENQUIRY_CAMPAIGN_TEMPLATE= {
                "name": "enquiryCustomerCampaign",
                "id": "1407169176155330228",
                "text": "Namaste, A warm welcome to the awesome Toyota family. We are delighted to receive your interest in Toyota vehicles. To know more about the Toyota Brand and its contribution to society and building sustainable future mobility, click here ${shortUrl}"
            };
            MainApp.locals.services.SMS.send(
                customerMobileNumber,
                ENQUIRY_CAMPAIGN_TEMPLATE,
                {
                    shortUrl: this.shortUrl
                },
                (err)=>{
                    if(err){
                        return next(err);
                    }
                    return next();
                });
        };

        const updateNotification= (next) =>{
            this.sentAt= Moment().format('YYYY-MM-DD');
            this.status= 'triggered';
            this.triggeredAt= new Date();
            this.lastModifiedBy= by;
            this.save(next);
        };

        Async.series([
            loadOrgUser,
            loadGlobalUser,
            sendPN,
            sendSMS,
            updateNotification
        ], cb);
    };

    schemaObj.statics.updateOpenedAt= function(by, id, data, cb) {
        this.findById(id, (err, doc) => {
            if (err) {
                return cb({...K.ERROR.MONGO_FIND, details: err});
            }
            if (!doc) {
                return cb({...K.ERROR.DOC_NOT_FOUND});
            }
            if (doc.lastOpenedAt) {
                if (!doc.prevOpenedAt){
                    doc.prevOpenedAt= [];
                }
                doc.prevOpenedAt.push(doc.lastOpenedAt);
                doc.markModified('prevOpenedAt');
            }
            doc.lastOpenedAt= new Date();
            console.log('')
            doc.save((err)=>{
                console.log(err);
                cb(err, doc);
            });
        });
    };

    const Notification = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Notification = Notification;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: SEQ_CODE_PREFIX, padding: SEQ_ID_PADDING}, (err) => {
        doneCb(err);
    });
    schemaObj.index({'name': 1});

    return;
};
