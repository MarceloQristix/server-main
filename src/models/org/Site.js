const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Validator = require('validator');
const Async = require('async');

const Utils = require('../utils');
const QRCode = require("qrcode");
const EJS = require("ejs");
const FS = require("fs");
const html_to_pdf = require("html-pdf-node");
const CollSchemaShort = Utils.CollSchemaShort;
const AddressSchema = Utils.AddressSchema;
const ContactSchema = Utils.ContactSchema;

const COLLECTION_NAME = 'site';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const CollectionSettings= app.locals.Settings.site;
    const SEQ_ID_PADDING= CollectionSettings.numDigits|| 6;
    const SEQ_CODE_PREFIX= 'SITE';

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
        address: {...AddressSchema},
        contact: {...ContactSchema},
        secondaryContact: {...ContactSchema},

        customerId: {type: ObjectId},
        // customer: {...CollSchemaShort},
        technicianId: {type:ObjectId},
        // technician: {...CollSchemaShort},
        salesExecId: {type: ObjectId},
        // salesExec: {...ContactSchema},

        orgUnit: {  //leaf/primary
            ...CollSchemaShort,
        },
        orgUnitIds: [ObjectId],
        clusterId: {
            type: ObjectId
        },

        consumables: [{}],  //for inventory

        //computed fields
        numAssets: {
            type: Number,
            default: 0
        },

        custom: {},

        /**
         * @desc - This is part of the qr code unique id
         */
        publicCode      : {  //{orgcode}-{site seqid}-{mongo objectId}
            type        : String,
        },
        // publicUrl       : {
        //     type        : String,
        // },

        status: {
            type: String,
            default: 'active',
            enum: ['draft', 'active']
        },

        files: {}
    });

    schemaObj.virtual('customer', {
        ref: 'customer',
        localField: 'customerId',
        foreignField: '_id',
        justOne: true
    });

    schemaObj.virtual('cluster', {
        ref: 'cluster',
        localField: 'clusterId',
        foreignField: '_id',
        justOne: true
    });

    schemaObj.virtual('technician', {
        ref: 'orgUser',
        localField: 'technicianId',
        foreignField: '_id',
        justOne: true
    });

    schemaObj.virtual('salesExec', {
        ref: 'orgUser',
        localField: 'salesExecId',
        foreignField: '_id',
        justOne: true
    });


    schemaObj.virtual('qrCodeUrl').get(function (){
        let paddedSeqId= this.code.replace(SEQ_CODE_PREFIX, '');
        return `/data/org/${app.locals.id}/sites/qrcodes/${paddedSeqId}.png`;
    });

    schemaObj.methods.reset2Draft= function () {
        let DRAFT_FIELDS= {
            "_id" : true,
            "status" : "draft",
            "createdBy" : true,
            "createdOn" : true,
            "lastModifiedOn" : true,
            "code" : true,
            "seqId" : true,
            "publicCode" : true,
            "name" : "Draft",
            "lastModifiedBy" : true,
            '__v': true
        }
        for (let key in schemaObj.paths) {
            if (!DRAFT_FIELDS[key]){
                this.set(key, undefined);
            }
        }
        this.status= 'draft';
        this.name= 'Draft';
    };

    schemaObj.post('findOne', function (result, next) {
        if (!result){
            return next();
        }
        const File= app.locals.models.File;
        File.find({'ref._id':result._id}, (err, records)=>{
            result.files= records;
            next();
        });
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
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
                        {'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')}},
                        {'code': searchStr},
                        {'secondaryCode': searchStr}
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
        if (!query.status){
            query.status= {$ne:'draft'};
        }
        else if (query.status === 'all'){
            delete query.status;
        }
        return query;
    };

    schemaObj.pre('findOne', function (next) {
        this.populate(['customer', 'cluster', 'technician', 'salesExec']);
        next();
    });

    schemaObj.pre('find', function (next) {
        this.populate(['customer', 'cluster', 'technician', 'salesExec']);
        this.setQuery(formatQuery(this.getQuery()));
        next();
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

        const genQRCode= (next2) =>{
            if (this.publicCode){   //QR code is already generated
                return next2();
            }
            const paddedSeqId= this.code.replace(SEQ_CODE_PREFIX, '');
            const baseUrl = `${app.locals.credentials.baseUrl}appv2/open/org`;
            const qrcodesOutDir = app.locals.dirs.sitesQRCodes;
            const orgCode = app.locals.Settings.code;
            const orgSeqId = app.locals.id;
            let publicCode = `${orgCode}-${this.code}-${this._id}`.toLowerCase();
            let url = `${baseUrl}/${orgSeqId}/site/${publicCode}`;

            this.publicCode= publicCode;
            if (!CollectionSettings.isQRCodesEnabled){
                return next2();
            }
            let options = {
                type: 'image/png',
                errorCorrectionLevel: 'H',
                width: 300
            };
            QRCode.toFile(
                qrcodesOutDir+'/'+paddedSeqId+'.png',
                url,
                options,
                (err)=>{
                    if (err){
                        return next2(err);
                    }
                    return next2();
                }
            );
        };

        const updateAssetCount= (next)=>{
            const Asset= app.locals.models.Asset;
            Asset.count({'site._id': this._id}, (err, count)=>{
                if(err){
                    return next(err);
                }
                this.numAssets= count;
                return next();
            });
        };

        Async.series([genSeqId, genQRCode, updateAssetCount], done);
    });

    schemaObj.virtual('publicUrl').get(function() {
        const orgSeqId = app.locals.id;
        let baseUrl;
        let appPrefix= 'appv2'
        baseUrl = `${app.locals.credentials.baseUrl}${appPrefix}/open/org`;
        return `${baseUrl}/${orgSeqId}/site/${this.publicCode}`;
    });

    schemaObj.post('save', function (doc,next) {

        const syncAddress= (next2)=>{
            const Asset = app.locals.models.Asset;
            if(!doc.address){
                return next2();
            }

            Asset.updateMany({ 'site._id': doc.id },{ $set: { address: doc.address } }, (err) => {
                if(err) {
                    return next2(err);
                }
                return next2();
            });
        };

        const createOrUpdateVirtualUser= (next2)=>{
            if (!Settings.site.autoCreateVirtualUser){
                return next2();
            }
            if (!doc.contact?.phoneNumber){
                return next2();
            }
            const OrgUser= app.locals.models.OrgUser;
            OrgUser.findOne({'globalUser.uniqueId': doc.contact.phoneNumber}, (err, user)=>{
                if(err){
                    return next2(err);
                }
                let by= doc.lastModifiedBy||doc.createdBy;
                let name= doc.contact.name || doc.name;
                let data= {
                    title: doc.title,
                    isVirtual: true,
                    virtualRef: {
                        _id: doc._id,
                        rType: 'site'
                    },
                    role: Settings.site.virtualUserRole,
                    firstName: name,
                    // lastName: doc.lastName,
                    code: doc.code,
                    globalUser: {
                        uniqueId: doc.contact.phoneNumber,
                        email: doc.contact.email
                    },
                    orgUnit: {...doc.orgUnit},
                    orgUnitIds: [...doc.orgUnitIds]
                };
                if (!user){ //create new user
                    return OrgUser.doCreate(doc.createdBy, data, (err)=>{
                        if (err){
                            console.log('error creating uer corresponding to site: ', doc.name);
                        }
                        next2(err);
                    });
                }
                return OrgUser.doUpdate(by, user._id, data, (err)=>{
                    if (err){
                        console.log('error updating user corresponding to site: ', doc.name);
                    }
                    next2(err);
                });
            });
        };
        Async.series([syncAddress, createOrUpdateVirtualUser], next);
    });

    schemaObj.methods.getShortForm = function () {
        return {
            _id: this._id,
            name: this.name,
            code: this.code,
            secondaryCode: this.secondaryCode,
            custom: {...this.custom}
        };
    };

    schemaObj.statics.addAssets = function (by,id,data,cb) {
        const Asset = app.locals.models.Asset;
        let site;
        let assetIds= data.assetIds;
        const loadSite = (next)=>{
            this.findById(id, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (!record){
                    return next('site not found');
                }
                site = record;
                return next();
            });
        }

        const updateAsset = next => {
            const ids = Lodash.map(assetIds, (id) => Mongoose.Types.ObjectId(id));
            Asset.updateMany({_id: {$in: ids}}, {$set: {site: site.getShortForm(), address: site.address}}, {multi: true}, next);
        };

        const updateSiteAssetCount = next => {
            Asset.countDocuments({'site._id': site._id}, (err, count)=>{
                if (err){
                    return next(err);
                }
                site.numAssets= count;
                site.save(next);
            });
        };

        Async.series([
            loadSite,
            updateAsset,
            updateSiteAssetCount,
        ], (err) => {
            if (err) cb(err);
            cb(false,site._doc);
        });
    };

    schemaObj.statics.removeAsset = function (by,id,data,cb){
        const Asset = app.locals.models.Asset;
        const Customer = app.locals.models.Customer;
        const { asset } = data;
        let site, assetData, customer;

        const loadAsset = next => {
            Asset.findById(asset, (err,record) => {
                if(err) return next(err);
                if(!record) return next('No Asset Found');
                assetData = record;
                return next();
            });
        };
        
        const loadCustomer = next => {
            Customer.findById(assetData.customer._id, (err,record) => {
                if(err) return next(err);
                if(!record) return next('No Customer Found');
                customer = record;
                return next();
            });
        };

        const updateAsset = next => {
            assetData.site = undefined;
            assetData.address = customer.address;
            assetData.save(next);
        };

        const loadSite = next => {
            this.findById(id,(err,record) => {
                if(err) return next(err);
                if(!record) return next('Site not found');
                site = record;
                return next();
            });
        };

        const updateSite = next => {
            site.numAssets -= 1;
            site.save(next);
        };

        Async.series([
            loadAsset,
            loadCustomer,
            updateAsset,
            loadSite,
            updateSite,
        ],(err)=>{
            if (err) cb(err);
            cb(false,site._doc);
        });
    };

    schemaObj.statics.addCustomer = function(by,id,data,cb){
        const Customer = app.locals.models.Customer;
        let customer;

        const loadCustomer = next => {
            Customer.findById(data.customerId, (err,record) => {
                if(err) return next(err);
                if(!record) return next('Customer not found');
                customer = record.getShortForm();
                return next();
            });
        };

        const updateSite = next => {
            this.findByIdAndUpdate(id,{ $set: { customer, lastModifiedBy: by } }, (err) => {
                if(err) return next(err);
                return next();
            });
        };

        Async.series([
            loadCustomer,
            updateSite
        ],(err)=>{
            if(err) cb(err);
            cb(false);
        })
    };

    schemaObj.statics.removeCustomer = function(by,id,cb){
        this.findByIdAndUpdate(id,{ $set : { customer: null, lastModifiedBy: by } }, (err) => {
            if(err) return cb(err);
            return cb(false);
        });
    };

    schemaObj.statics.addConsumable = function(id,data,cb){
        const Consumable = app.locals.models.Consumable;
        let consumables = [], site;
        let quantityMap = {};
        let ids = Lodash.map(data.consumables, (val)=> {
            quantityMap[val.id] = val.quantity;
            return Mongoose.Types.ObjectId(val.id);
        });

        const loadConsumables = next => {
            Consumable.find({_id:{ $in:ids }}, (err,record) => {
                if(err) return next(err);
                if(!record) return next('consumable not found');
                Lodash.map(record, (item) => {
                    consumables.push({                        
                        ...item.getShortForm(),
                        quantity: quantityMap[item._id.toString()],
                        updatedDate: new Date()
                    });
                });
                return next();
            });
        };

        const loadSite = next => {
            this.findById(id, (err,record) => {
                if(err) return next(err);
                if(!record) return next('No site found');
                site = record;
                return next();
            });
        };

        const updateSite = next => {
            site.consumables = [...consumables];
            site.save(next);
        };

        Async.series([
            loadConsumables,
            loadSite,
            updateSite
        ], (err) => {
            if(err) cb(err);
            cb(false,site._doc);
        });
    };

    schemaObj.statics.updateConsumable = function(id,data,cb){
        this.updateOne({ _id: id, "consumables._id": Mongoose.Types.ObjectId(data.id) },{ $set: { "consumables.$.quantity": data.quantity, "consumables.$.updatedDate": new Date() } },(err,result) => {
            if(err) return cb(err);
            return cb(false,result);
        });
    };

    schemaObj.statics.processInputData = function(by,inputData,cb) {
        let data = { ...inputData };
        const OrgUser = app.locals.models.OrgUser;

        const loadTechnician = next => {
            if (!data.technician?._id) {
                return next();
            }
            OrgUser.findById(data.technician._id, (err,record) => {
                if(err) return next(err);
                if(!record) return next();
                delete data.technician;
                data.technician = record.getShortForm();
                return next();
            });
        };        

        Async.series([ loadTechnician ],(err) => {
            return cb(err,data);
        });
    };


    /**
     * https://qristix.com/app/open/org/{org sequence id}/asset/{random 8 unique code for org}-{8 hex seq 00000001} - {random 8 char alphanumeric}
     */
    schemaObj.statics.createMany = function (count, options={}, cb) {
        const Site = this;
        let orgUnit;
        const loadOrgUnit= (next)=>{
            const OrgUnit= app.locals.models.OrgUnit;
            if (!options?.orgUnitId){
                return next();
            }
            OrgUnit.findById(options.orgUnitId, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return next('org unit not found');
                }
                orgUnit= record;
                return  next();
            });
        };

        const doCreateSites= (next)=> {
            const createSite = (index, next2) => {
                let site = new Site({
                    name: 'Draft',
                    status: 'draft',
                    createdBy:
                    app.locals.admin._id
                });
                if (orgUnit){
                    site.orgUnit= orgUnit.getShortForm();
                }
                site.save(next2);
            };
            Async.timesSeries(count, createSite, next);
        }
        Async.series([
                loadOrgUnit,
                doCreateSites,
            ],
            cb
        );
    };

    schemaObj.statics.generateQRCodeStickers = function (options, cb) {
        const SiteModel = this;

        const orgSeqId = app.locals.id;
        const qrcodesOutDir = app.locals.dirs.sitesQRCodes;
        let condition= {};
        let seqIdStart = 1;
        let seqIdEnd = seqIdStart;
        let fileName= '';
        let sites= [];
        let htmlOutput= '';

        const loadMetaInfo = (next) =>{
            if (!options) {
                return next();
            }

            if (options.orgUnitCode) {
                condition['orgUnit.code'] = options.orgUnitCode;
                fileName= options.orgUnitCode;
            }
            else if (options.customerCode) {
                condition['customer.code'] = options.customerCode;
                fileName= options.customerCode;
            }
            else if (options.code) {
                condition['code'] = options.code;
                fileName= options.code;
            }
            else if(options.status){
                condition.status= options.status;
            }
            else {
                if (options.seqIdStart) {
                    condition.seqId = {$gte: options.seqIdStart};
                    seqIdStart = options.seqIdStart;
                    seqIdEnd = seqIdStart;
                }
                if (options.seqIdEnd) {
                    if (!condition.seqId) {
                        condition.seqId = {};
                    }
                    condition.seqId['$lte'] = options.seqIdEnd;
                    seqIdEnd = options.seqIdEnd;
                }
            }
            return next();
        };

        const loadSites = (next) =>{
            const fields= {seqId:1, code:1, secondaryCode:1, serialNumber:1};
            condition.status='all';//find exclude draft , so this is mandatory
            SiteModel.find(condition,fields,{sort:{seqId:1}}, (err, records) =>{
                if(err){
                    return next(err);
                }
                sites= records;
                let numQrCodes = sites.length;
                if (seqIdEnd === seqIdStart){
                    seqIdEnd= seqIdStart+numQrCodes-1;
                }
                if (!fileName) {
                    fileName= `${seqIdStart}-${seqIdEnd}`;
                }
                console.log('num Sites:', numQrCodes, fileName);
                return next();
            });
        };

        const generateHtml = (next) =>{
            let htmlFile = `${qrcodesOutDir}/${fileName}.html`;
            let data = {...app.locals.Settings};
            let options = {};
            let outRecords= [];

            for (let index=0; index<sites.length; index++){
                let record= sites[index];
                let paddedSeqId= record.code.replace(SEQ_CODE_PREFIX, '');
                outRecords[index]= {
                    qrCodeImageUrl: `/data/org/${orgSeqId}/sites/qrcodes/${paddedSeqId}.png`,
                    code    : record.code,
                };
            }
            data.records = outRecords;
            data.baseUrl = app.locals.credentials.baseUrl;
            data.baseUrl= data.baseUrl.substr(0,data.baseUrl.length-1);
            data.fileName= fileName;
            data.qrSticker= {...Settings.qrSticker};

            EJS.renderFile('tpls/html/site-qr-codes-landscape.ejs', data, options, (err, tplOutput)=>{
                if(err){
                    console.log('error creating html', err);
                    return next(err);
                }
                htmlOutput= tplOutput;
                console.log('success!', htmlFile);
                FS.writeFile(htmlFile, htmlOutput, 'utf8', next);
            });
        };

        const generatePdf = (next) =>{
            return next();
            let pdfFile = `${qrcodesOutDir}/${fileName}.pdf`;
            let file = { content: htmlOutput };
            let options = { width: '12in', height: '18in', path: pdfFile };
            html_to_pdf.generatePdf(file, options)
                .then(() => {
                    return next();
                })
                .catch((err)=>{
                    return next(err);
                });
        };

        Async.series([loadMetaInfo, loadSites, generateHtml, generatePdf], cb);
    };

    const Site = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Site = Site;

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.index({'name': 1});
    schemaObj.index({'seqId': 1}, {unique: true});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'secondaryCode': 1}, {unique: true, sparse: true});
    schemaObj.index({'publicCode': 1}, {unique: true, sparse: true});
    schemaObj.index({'clusterId': 1});
    schemaObj.index({'technicianId': 1});
    schemaObj.index({'salesExecId': 1});

    schemaObj.index({'contact.phoneNumber': 1});
    schemaObj.index({'contact.altPhoneNumber': 1});
    if (Settings.site.autoCreateFromCustomer){
        schemaObj.index({'customer._id': 1}, {unique: true, sparse: true});
    }

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: SEQ_CODE_PREFIX, padding: SEQ_ID_PADDING}, (err) => {
        Site.syncIndexes();
        doneCb(err);
    });

    return;
};
