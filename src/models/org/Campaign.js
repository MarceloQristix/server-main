const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Async= require('async');
const {mkdirpSync} = require("fs-extra");
const fs = require("fs");
const {setTwilioEmailAuth} = require("@sendgrid/mail");
const imageThumbnail = require('image-thumbnail');

const COLLECTION_NAME = 'campaign';
const SEQ_CODE_PREFIX= 'CAMP';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const TEMPLATE_TYPES = Lodash.map(Settings.campaign.templateTypes, 'id');

    const schemaObj = new Schema({
        name: {
            type: String,
            trim: true,
            required: true
        },
        code: {
            type: String,
            unique: true
        },
        seqId: {
            type: Number,
            unique: true
        },
        version: {  //every update will create a version
            type: Number,
            default: 1,
        },
        template: {
            type: String,
            enum: TEMPLATE_TYPES
        },
        data    : {
            title: {
                type: String
            },
            body: { //Quill HTML

            }
        },
        media: {
            //hero Image
        },
        status  : {
            type: String,
            default: 'active',
            enum:[ 'active', 'inactive', 'draft']
        },
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let searchRegExp= new RegExp('.*' + searchStr + '.*', 'i');
            let conditions = {'name': {$regex: searchRegExp}}
            delete query.q;
            query = {...conditions};    //While searching other filters are purposefully ignored
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
        this.version++;
        const generateNextSequence= (next2) =>{
            if (!this.isNew) {
                return next2();
            }
            Counter.getNextSequence(COLLECTION_NAME, (err, {code, seqId}) => {
                if (err) {
                    console.log(err);
                    return next('error while getNextSequence!');
                }
                this.code = code;
                this.seqId = seqId;
                next2();
            });
        }

        const storeMedia2FS= (next2) =>{
            const orgSeqId = app.locals.id;
            //TODO: Store the based64 image onto file system
            //TODO: Create thumbnail
            let mediaIds= Object.keys(this.media||{});
            let isUpdated= false;
            const upload2S3= (mediaId, next3) =>{
                //TODO: implement s3 upload
                let b64string = this.media[mediaId].base64;
                if (!b64string||!b64string.substring){
                    return next3();
                }
                let extension= b64string.substring("data:image/".length, b64string.indexOf(";base64"));
                let baseDir= app.locals.dirs.campaigns+'/'+this.code;
                mkdirpSync(baseDir);
                let fileName= mediaId+'.'+extension;
                let base64Data = b64string.replace(/^data:image\/png;base64,/, "");
                let buf = Buffer.from(base64Data, 'base64');
                let filePath= baseDir+'/'+fileName;
                fs.writeFile(filePath, buf,  "base64",(err) => {
                    if(err) {
                        return next3(err);
                    }
                    isUpdated= true;
                    let thumbFileName= 'thumb-32-'+mediaId+ '.jpg';
                    let mediaFileBaseUrl= `/data/org/${orgSeqId}/campaigns/${this.code}/`;
                    console.log(filePath);
                    imageThumbnail(filePath, {responseType:'base64'})
                        .then(thumbnail => {
                            console.log('about to write to file')
                            fs.writeFile(baseDir+'/'+thumbFileName, thumbnail,  "base64",(err) => {
                                if (err) {
                                    return next3(err);
                                }
                                this.media[mediaId]= {url: mediaFileBaseUrl+fileName, thumbnailUrl: mediaFileBaseUrl+thumbFileName};
                                console.log(this.media);
                                return next3();
                            });
                        })
                        .catch(err => {
                            console.error(err);
                            return next3();
                        });
                });
            };
            Async.each(mediaIds, upload2S3, (err)=>{
                if (err){
                    return next2(err);
                }
                if (!isUpdated){
                    return next2();
                }
                this.markModified('media');
                return next2()
            });
        }

        Async.series([generateNextSequence, storeMedia2FS], next);
    });

    schemaObj.post('save', function (doc, next) {
        //FIXME: Sync in all the collections where there is replication.
        next();
    });

    schemaObj.statics.send= function (reqUser, id, data, cb){
        let by= reqUser?.orgMe?._id;
        if (!by){
            by= reqUser._id;
        }
        let is4Enquiry= (data.type === 'enquiry');

        const OrgUser= app.locals.models.OrgUser;
        const Notification= app.locals.models.Notification;

        let campaign;
        let users;
        let notifications= [];
        const loadCampaign= (next)=>{
            Campaign.findById(id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('Campaign not found !!');
                }
                campaign= record;
                return  next();
            });
        };

        const loadUsers= (next)=>{
            if (is4Enquiry){
                return next();
            }
            let virtualRefIds= Lodash.map(data.customerIds, (id)=>{return Mongoose.Types.ObjectId(id)});
            OrgUser.find({'virtualRef._id' : {$in: virtualRefIds}}, (err, records)=>{
                if (err){
                    return next(err);
                }
                users= records;
                return next();
            });
        };

        let enquiries= [];

        const loadEnquiryCustomers= (next)=>{
            const Enquiry= app.locals.models.Enquiry;
            Enquiry.find({'customer.contact.phoneNumber': {$in:data.customerIds}}, (err, records)=>{
                if (err){
                    return next(err);
                }
                users= [];
                records.forEach((record)=>{
                    users.push(record.customer);
                });
                enquiries= records;
                return next();
            });
        };

        const createNotifications4User= (next)=>{
            if (is4Enquiry){
                return next();
            }
            let baseData= {
                name: campaign.data.title,
                entity: campaign.getShortForm(),
                entityType: 'campaign',
                thumbnailUrl: campaign.media?.heroImage?.thumbnailUrl
            };
            const doCreateNotification= (user, next2) =>{
                let notifData= {
                    ...baseData,
                    receiver: user.getShortForm()
                };
                Notification.doCreate(reqUser, notifData, (err, notification)=>{
                    if(err){
                        return next2(err);
                    }
                    notifications.push(notification);
                    return next2();
                });
            };

            Async.eachSeries(users, doCreateNotification, next);
        };

        const createNotifications4EnquiryCustomer= (next)=>{
            if(!is4Enquiry){
                return next();
            }
            let baseData= {
                name: campaign.data.title,
                entity: campaign.getShortForm(),
                entityType: 'campaign',
                thumbnailUrl: campaign.media?.heroImage?.thumbnailUrl,
                channel: 'sms'
            };
            const doCreateNotification= (enquiry, next2) =>{
                let notifData= {
                    ...baseData,
                    // receiver: user.getShortForm()
                    enquiryId: enquiry._id,
                    customer: {...enquiry.customer}
                };
                Notification.doCreate(reqUser, notifData, (err, notification)=>{
                    if(err){
                        return next2(err);
                    }
                    notifications.push(notification);
                    return next2();
                });
            };

            Async.eachSeries(enquiries, doCreateNotification, next);
        };

        const triggerNotifications= (next) =>{
            const doSend= (notification, next2)=>{
                notification.send(by, {}, next2);
            };

            Async.eachSeries(notifications, doSend, next);
        };

        Async.series([
            loadCampaign,
            loadUsers,
            loadEnquiryCustomers,
            createNotifications4User,
            createNotifications4EnquiryCustomer,
            triggerNotifications
        ], (err)=>{
            if (err){
                return cb(err);
            }
            cb(undefined, campaign);
        });
    };

    const Campaign = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Campaign = Campaign;

    schemaObj.index({'name': 1});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'createdOn': 1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: SEQ_CODE_PREFIX, padding: 6}, (err) => {
        doneCb(err);
    });

    return;
};
