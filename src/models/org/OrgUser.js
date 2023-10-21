const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Utils = require('../utils');
const K = require("../../K");
const Async = require("async");
const RandomString = require("randomstring");
const Lodash = require("lodash");
const Validator = require("validator");
const AddressSchema = Utils.AddressSchema;
const ContactSchema = Utils.ContactSchema;
const CollSchemaShort= Utils.CollSchemaShort;

const COLLECTION_NAME = "orgUser";
const BLOOD_GROUPS= [
    'A+',
    'A-',
    'B+',
    'B-',
    'O+',
    'O-',
    'AB+',
    'AB-'
];

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const CollSettings= Settings.orgUser;
    const USER_ROLES = Utils.getIds(Settings.orgUser.roles);
    const ROLE_MAP= {};
    Settings.orgUser.roles.forEach((role)=>{
        ROLE_MAP[role.id]= role.name;
    });

    const schemaObj = new Schema({
        globalUser  : {
            ...CollSchemaShort,
            uniqueId: {type : String, unique: true},
            status  : {type: String},
            email   : {type: String},
            phoneNumber: {type:String}
        },
        title       : {type: String},
        firstName   : {type: String, required: true},
        lastName    : {type: String},
        name        : {type:String, required: true},    //dup of globalUser.name
        code        : { //Employee code -- unique with in the org
            type    : String,
            required: CollSettings.fields.code?.required
        },
        seqId       : {
            type    : Number,
            unique  : true
        },
        reportsTo   : {...CollSchemaShort},
        manages     : [{...CollSchemaShort}],
        role        : {
            type    : String,
            required: true,
            enum    : USER_ROLES
        },
        orgUnit     : { //belongsTo
            ...CollSchemaShort
        },
        orgUnitIds  : [ObjectId],

        directReports: [ObjectId],  //based on reportsTo
        indirectReports: [ObjectId],    //based on reportTo's parent reportsTo
        contact     : {...ContactSchema},
        address     : {...AddressSchema},
        latestLoc   : {
            lat         : {type: Number},
            lng         : {type: Number},
            receivedOn  : {type: Date},
        },
        lastActive  : {type:Date},

        dob: {
            type: Date
        },
        doj: {
            type: Date
        },
        bloodGroup: {
            type: String,
            enum: BLOOD_GROUPS
        },

        esin: { //employee state insurance number
            type: String
        },
        uan: {  //PF unique identification number
            type: String
        },

        isVirtual: {
            type: Boolean
        },
        virtualRef: {
            rType: {
                type: String,
                enum: ['customer', 'site']
            },
            _id: {
                type: ObjectId
            }
        },
        isUsageTermsAccepted: {
            type: Boolean
        },
        usageTermsAcceptedOn: {
            type: Date
        },

        clusters  : [{type: ObjectId, ref:'cluster'}] ,
        clusterIds: [{type:ObjectId}],
        site: {type: ObjectId, ref: 'site'},
        siteId: {type:ObjectId},
        remarks: {
            type: String
        },

        locationPermissionStatus: {
            type: String
        },
        locationPermissionCheckedAt: {
            type: Date
        },

        lastLogin: {
            type: Date
        },
        lastEvent       : {type: ObjectId, ref: 'eventLog'},
        lastLocation    : {
            lat         : {type: Number},
            lng         : {type: Number},
            event       : {type: ObjectId, ref: 'eventLog'},
            capturedAt  : {type: Date}
        }
    });

    schemaObj.pre('findOne', function (next) {
        this.populate('clusters');
        this.populate('site');
        this.populate('lastEvent');
        this.populate('lastLocation.event');
        next();
    });

    schemaObj.virtual('roleText').get(function() {
        return ROLE_MAP[this.role];
    });

    schemaObj.virtual('status').get(function() {
        return this.globalUser.status;
    });

    schemaObj.virtual('access').get(function() {
        let actions= {
            activate: true,
            deactivate: true
        };
        if (this.globalUser?.status === 'active'){
            actions.activate= false;
        }
        else {
            actions.deactivate= false;
        }
        return actions;
    });

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    const formatQuery = function (query) {
        if (query.uType){   //technician
            query.access=  {"resource": "ticket", "action": "work"};
            query.role= {$nin:['business_head', 'manager', 'admin']};
            delete query.uType;
        }
        if (query.q) {
            let searchStr= query.q;
            let conditions= {};
            let regexp= {$regex: new RegExp('.*'+searchStr+'.*', 'i')};
            conditions['$or']=[
                {'name': regexp},
                {'orgUnit.name': regexp},
                {'globalUser.uniqueId': regexp}
            ];
            delete query.q;
            let otherConditions= {...query};
            query = {...conditions, ...otherConditions};
        }
        if (query.roleWeightGreaterThan){
            let rolesDef= app.locals.Settings.orgUser.roles;
            let roles = [];
            for (let index=0, numRoles= rolesDef.length; index< numRoles; index++){
                if (rolesDef[index].wieght > query.roleWeightGreaterThan){
                    roles.push(rolesDef[index].id);
                }
            }
            query.role = {$in: roles};
            delete query.roleWeightGreaterThan;
        }
        if (query.access){  //roles having this access will be filtered
            let resource= query.access.resource;
            let action = query.access.action;
            let rolesDef= app.locals.Settings.orgUser.roles;
            let roles = [];
            for (let index=0, numRoles= rolesDef.length; index< numRoles; index++){
                let access= rolesDef[index].access;
                if (access[resource] && access[resource][action]) {
                    roles.push(rolesDef[index].id);
                }
            }
            if (query.role){
                if (query.role['$nin']){
                    roles= Lodash.difference(roles, query.role['$nin']);
                }
            }
            query.role = {$in: roles};
            delete query.access;
        }
        let ids= query.id;
        if (ids){
            if (Array.isArray(ids)){
                query._id= {$in: Lodash.map(ids, (id)=>{return Mongoose.Types.ObjectId(id)})};
            }
            else {
                query._id = Mongoose.Types.ObjectId(ids);
            }
            delete query.id;
        }
        if (query.includeMe){
            let myId= Mongoose.Types.ObjectId(query.includeMe);
            Mongoose.Types.ObjectId(query.includeMe)
            query= {'$or':[{_id: myId}, {...query}]};
        }
        if(query.reportsTo){
            query['reportsTo._id']= Mongoose.Types.ObjectId(query.reportsTo);
            delete query.reportsTo;
        }
        if (!query['globalUser.status']){
            if (!query.status){
                query['globalUser.status']= {$ne:'blocked'};
            }
            else {
                query['globalUser.status']= query.status;
                delete query.status;
            }
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

    schemaObj.statics.acceptUsageTerms= function (by, id, data, cb) {
        this.findById(id, (err, record)=>{
            if (err){
                return cb(err);
            }
            record.isUsageTermsAccepted= true;
            record.usageTermsAcceptedOn= new Date();
            record.save((err)=>{
                cb(err, record);
            });
        });
    };

    schemaObj.statics.doCreate = function (by, data, cb) {
        const Self = this;
        const mainApp = app.locals.mainApp;
        const passwd= data.globalUser.password || RandomString.generate({length:6, charset: 'numeric'});
        let user, orgUnit, manages, reportsTo, userExists = false;
        const User= mainApp.locals.models.User;
        const OrgUnit = app.locals.models.OrgUnit;
        if (!data.firstName){
            return cb('firstName is required');
        }
        data.name= data.firstName;
        if (data.lastName){
            data.name += ' '+data.lastName;
        }
        data.globalUser.name= data.name;

        const loadManagedUnit = next => {
            if (!data.manages){
                return next();
            }
            OrgUnit.findById(data.manages,(err,result) => {
                if(err) return next(err);
                if(!result) return next('Org Unit not found');
                manages = result;
                return next();
            });
        };

        const loadOrgUnit = next => {
            if (!data.belongsTo){
                return next();
            }
            OrgUnit.findById(data.belongsTo,(err,result) => {
                if(err) return next(err);
                if (!result) return next('Org Unit not found ');
                orgUnit = result;
                return next();
            });
        };

        const loadReportsTo = (next) =>{
            if (!data.reportsTo){
                return next();
            }
            OrgUser.findById(data.reportsTo, (err, boss)=>{
                if (err){
                    return next();
                }
                if (boss){
                    reportsTo= boss;
                    if (!reportsTo.directReports){
                        reportsTo.directReports= [];
                    }
                }
                return next();
            });
        };

        const createGlobalUser= (next)=>{
            const uniqueId= data.globalUser.uniqueId;
            User.findOne({uniqueId: uniqueId}, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (record) {
                    userExists= true;
                //     return next({message:'User already exists'});
                }
                let userData = {
                    role: 'member',
                    name: data.globalUser.name,
                    status: 'active',
                    uniqueId: data.globalUser.uniqueId,
                    memberOrgs: [app.locals._id],
                    password: passwd,
                    email: data.globalUser.email,
                    phoneNumber: data.globalUser.phoneNumber
                };
                User.createIfNotExists(by, userData, (err, newUser)=>{
                    if (err){
                        return next(err);
                    }
                    data.globalUser= {
                        _id: newUser._id,
                        name: newUser.name,
                        code: newUser.code,
                        uniqueId: newUser.uniqueId,
                        status  : newUser.status,
                        email   : newUser.email,
                        phoneNumber: newUser.phoneNumber
                    }
                    return next();
                });
            });
        };

        let createLocalOrgUser = (next) =>{
            let doc = new Self({...data,
                createdBy: by,
                createdOn: new Date(),
                name: data.globalUser.name //duplicate just have consistency
            });
            if (orgUnit){
                doc.orgUnit= orgUnit.getShortForm()
            }
            if(manages){
                doc.manages = manages.getShortForm()
            }
            if (reportsTo){
                doc.reportsTo= reportsTo.getShortForm();
            }
            doc.save((err) => {
                if (err){
                    return next({...K.ERROR.MONGO_SAVE, details: err});
                }
                user= doc;
                return next();
            });
        };

        const updatePassword = (next) =>{
            if (!userExists){
                return next();
            }
            User.findById(user.globalUser._id, (err, newUser)=>{
                newUser.setPassword(passwd, () => {
                    newUser.save(next);
                });
            });
        };

        const updateDirectReports= (next) =>{
            if (!reportsTo){
                return next();
            }
            if (reportsTo.directReports.indexOf(user._id) !== -1) {
                return next();
            }
            reportsTo.directReports.push(user._id);
            reportsTo.markModified('directReports');
            reportsTo.save(next);
        };

        const updateIndirectReports = (next) =>{
            if (!reportsTo){
                return next();
            }
            let cond= {'$or': [{'directReports._id':reportsTo._id}, {'indirectReports._id': reportsTo._id}]};
            OrgUser.update(cond, {$addToSet: {indirectReports: user._id}}, (err)=>{
                return next();
            });
        };

        Async.series([
            loadManagedUnit,
            loadOrgUnit,
            loadReportsTo,
            createGlobalUser,
            createLocalOrgUser,
            updatePassword,
            updateDirectReports,
            updateIndirectReports,
        ],(err)=>{
            console.error(err);
            return cb(err, user);
        });
    };

    schemaObj.statics.block = function(doneBy,id, data, cb){
        const by= doneBy._id|| doneBy.id;
        let orgUser,globalUser;
        const mainApp = app.locals.mainApp;
        const User = mainApp.locals.models.User;
        
        const loadOrgUser = next => {
            this.findById(id,(err,doc) => {
                if(err) return next(err);
                if(!doc) return next('Org User not found');
                orgUser = doc;
                return next();
            });
        };

        const blockUser = next => {
            User.deActivate(doneBy,orgUser?.globalUser?._id,orgUser,(err,doc) => {
                if(err) return next(err);
                globalUser = doc.getShortForm();
                return next();
            });
        };

        const updateOrgUser = next => {
            orgUser.globalUser = globalUser;
            orgUser.remarks= data.remarks;
            orgUser.save(next);
        };

        Async.series([
            loadOrgUser,
            blockUser,
            updateOrgUser
        ],(err) => {
            if(err) return cb(err);
            return cb(false,orgUser);
        });
    };

    schemaObj.statics.activate = function(doneBy,id,data,cb){
        const by= doneBy._id||doneBy.id;
        let orgUser,globalUser;
        const mainApp = app.locals.mainApp;
        const User = mainApp.locals.models.User;
        
        const loadOrgUser = next => {
            this.findById(id,(err,doc) => {
                if(err) return next(err);
                if(!doc) return next('Org User not found');
                orgUser = doc;
                return next();
            });
        };

        const activateUser = next => {
            User.activate(doneBy,orgUser?.globalUser?._id,orgUser,(err,doc) => {
                if(err) { console.log(err);return next(err); }
                globalUser = doc.getShortForm();
                return next();
            });
        };

        const updateOrgUser = next => {
            orgUser.globalUser = globalUser;
            orgUser.remarks= data.remarks;
            orgUser.save(next);
        };

        Async.series([
            loadOrgUser,
            activateUser,
            updateOrgUser
        ],(err) => {
            if(err) return cb(err);
            return cb(false,orgUser);
        });
    };

    schemaObj.statics.updatePassword = function(doneBy,id,data,cb){
        const by= doneBy._id;
        let orgUser;
        const mainApp = app.locals.mainApp;
        const User = mainApp.locals.models.User;
        
        const updateLocalUser = next => {
            this.findByIdAndUpdate(id,{ lastModifiedBy: by }, (err,doc) => {
                if(err) return next(err);
                orgUser = doc;
                return next();
            });
        };

        const updateGlobalUser = next => {
            User.findById(orgUser.globalUser._id, (err, user)=>{
                if(err) return next();
                user.setPassword(data.password, () => {
                    user.save(next);
                });
            });
        };

        Async.series([
            updateLocalUser,
            updateGlobalUser
        ],(err) => {
            if(err){
                console.error(err);
                return cb(err);
            }
            return cb(false,orgUser);
        });
    };

    schemaObj.statics.sendWelcomeEmail = function(by,id,data,cb){
        const mainApp= app.locals.mainApp;
        const User = mainApp.locals.models.User;
        const OrgUser= this;
        const OrgUnit= app.locals.models.OrgUnit;
        const EmailService= mainApp.locals.services.Email;
        const SMS= mainApp.locals.services.SMS;

        const from= 'account-services@qristix.com';
        let userEmail= '', userMobile='';
        let userName;
        let orgUser, orgUnit;
        let globalUser;

        const loadGlobalUser= (next) =>{
            User.findById(orgUser.globalUser._id, (err, record)=>{
                if(err) {
                    return next(err);
                }
                globalUser= record;
                return next();
            });
        };

        const loadLocalUser= (next)=> {
            OrgUser.findById(id, (err, record)=>{
                if (err){
                    return next(err);
                }
                if (!record){
                    return  next('user not found');
                }
                orgUser= record;
                return next();
            });
        };

        const loadOrgUnit= (next)=>{
            let orgUnitId= orgUser.orgUnit?._id;
            if (!orgUnitId){
                return next();
            }
            OrgUnit.findById(orgUnitId, (err, record)=>{
                if (err){
                    return next(err);
                }
                orgUnit= record;
                return next();
            });
        }

        const checkEmail= (next)=>{
            if (Validator.isEmail(globalUser.uniqueId)){
                userEmail= globalUser.uniqueId;
                return next();
            }
            if (globalUser.email && Validator.isEmail(globalUser.email)){
                userEmail= globalUser.email;
                return next();
            }
            if (globalUser.contact?.email && Validator.isEmail(globalUser.contact.email)){
                userEmail= globalUser.contact.email;
                return next();
            }
            return next();
        };

        const checkMobileNumber= (next)=>{
            if (Validator.isMobilePhone(globalUser.uniqueId)){
                userMobile= globalUser.uniqueId;
                return next();
            }
            else if (Validator.isMobilePhone(globalUser.phoneNumber||'')){
                userMobile= this.phoneNumber;
                return next();
            }
            else if (Validator.isMobilePhone(globalUser.contact?.phoneNumber||'')){
                userMobile= globalUser.contact.phoneNumber;
                return next();
            }
            return next();
        };


        const sendMessage= (next)=>{

            userName= globalUser.name||globalUser.firstName
            let subject = 'Welcome aboard the QRisTix Platform';
            let template = 'user-welcome';
            let templateData= {body:{}};
            templateData.body.name= userName;
            let roleText= ROLE_MAP[orgUser.role];
            let orgUnitName= orgUnit?.name;
            templateData.body.product= {
                name: 'QRisTix',
                link: 'https://qristix.com/appv2',
                // Custom copyright notice
                copyright: 'Copyright © 2023 QRisTix. All rights reserved.',
            };
            let roleAndOrgUnit= `You have been added as  <b>${roleText}</b>`;
            if (orgUnitName){
                roleAndOrgUnit += ` for <b>${orgUnitName}</b>`;
            }
            roleAndOrgUnit+='.'
            let userIdText= '';
            const loginId= globalUser.uniqueId;
            if (Validator.isMobilePhone(loginId)){
                userIdText= `Mobile Number <b>${loginId}</b> as User ID`;
            }
            else if (Validator.isEmail(loginId)){
                userIdText= `Email <b>${loginId}</b> as User ID`;
            }
            else {
                userIdText= `User ID <b>${loginId}</b>`;
            }

            if (!userEmail){
                console.log('user does not have any email id set');
            }

            const sendEmail= (next2)=>{
                if (!userEmail){
                    return next2();
                }
                templateData.body.intro= [
                    `Welcome aboard the ${Settings.flavor} !`,
                    roleAndOrgUnit,
                    `To login , please use your ${userIdText} and request OTP.`,
                    'Best,',
                    'Team QRisTix'
                ];
                EmailService.send(subject, template, {templateData}, userEmail, from, function (err){
                    if (err){
                        return next2(err);
                    }
                    return  next2();
                });
            };

            const sendSMS= (next2)=> {
                if (!CollSettings.welcomeMessage.sms) {
                    return next2();
                }
                if (!userMobile){
                    return next2();
                }
                let deploymentName= app.locals.Settings.name;
                const USER_WELCOME_TEMPLATE= {
                    "name": "userWelcome",
                    "id": "1407169113294610079",
                    "text": "Hello ${userName}, You have been added as a ${roleText} by ${deploymentName}. To login, go to https://qristix.com/appv2 . QRisTix FSM"
                };
                SMS.send(userMobile, USER_WELCOME_TEMPLATE, {userName, roleText, deploymentName}, next);
            }

            Async.series([sendEmail, sendSMS], next);
        };


        Async.series([
            loadLocalUser,
            loadGlobalUser,
            checkEmail,
            checkMobileNumber,
            loadOrgUnit,
            sendMessage
        ],(err) => {
            if(err){
                console.error(err);
                return cb(err);
            }
            return cb(undefined,orgUser);
        });
    };

    schemaObj.statics.doUpdate = function (by, id, data, cb) {
        const mainApp = app.locals.mainApp;
        let orgUser;
        const OrgUnit = app.locals.models.OrgUnit;

        if (!data.firstName){
            return cb('firstName is required');
        }
        data.name= data.firstName
        if (data.lastName){
            data.name += ' '+data.lastName;
        }
        data.globalUser.name= data.name;

        const loadManagedUnit = next => {
            if (!data.manages) {
                return next();
            }
            OrgUnit.findOne({ _id: data.manages },(err,result) => {
                if(err) return next(err);
                if(!result) return next('Org Unit not found');
                data.manages = result.getShortForm();
                return next();
            });
        };

        const loadOrgUnit = next => {
            if (!data.orgUnit){
                return next();
            }
            if (typeof (data.orgUnit) !== 'string'){
                return next();
            }
            OrgUnit.findOne({ _id: data.orgUnit },(err,result) => {
                if(err) return next(err);
                if(!result) return next('Org Unit not found ');
                data.orgUnit = result.getShortForm();
                return next();
            });
        };

        let oldReportsTo, newReportsTo;

        let loadLocalOrgUser = (next) => {
            this.findById(id, (err, doc) => {
                if(err) return next({...K.ERROR.MONGO_FIND, details: err});
                if(!doc) return next({...K.ERROR.DOC_NOT_FOUND});
                orgUser = doc;
                if (!orgUser.reportsTo||!orgUser.reportsTo._id) {
                    return next();
                }
                this.findById(orgUser.reportsTo._id, (err, doc2)=>{
                    if(err){
                        return next(err);
                    }
                    if (!doc2){
                        return next('boss not found!');
                    }
                    oldReportsTo= doc2;
                    if (!oldReportsTo.directReports){
                        oldReportsTo.directReports= [];
                    }
                    return next();
                });
            });
        };

        const loadReportsTo = (next) =>{
            if (!data.reportsTo){
                return next();
            }
            OrgUser.findById(data.reportsTo, (err, boss)=>{
                if (err){
                    return next();
                }
                if (!boss) {
                    return next('new boss not found!')
                }
                newReportsTo= boss;
                if (!newReportsTo.directReports){
                    newReportsTo.directReports= [];
                }
                return next();
            });
        };


        let updateGlobalUser= (next)=>{
            const User= mainApp.locals.models.User;
            User.findById(orgUser.globalUser._id, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (!record) {
                    return next({message:'User does not exist'});
                }
                record.name = data.globalUser.name;
                record.email = data.globalUser.email;
                record.phoneNumber = data.globalUser.phoneNumber;
                record.uniqueId = data.globalUser.uniqueId;
                record.lastModifiedBy = by;
                record.save((err)=>{
                    if(err){
                        return next(err);
                    }
                    data.globalUser= {
                        _id: record._id,
                        name: record.name,
                        code: record.code,
                        uniqueId: record.uniqueId,
                        status  : record.status,
                        email   : record.email,
                        phoneNumber: record.phoneNumber
                    };
                    return next();
                });
            });
        };

        let updateLocalOrgUser = (next) =>{
            if (data.reportsTo && newReportsTo){
                data.reportsTo= newReportsTo.getShortForm();
            }
            for (let key in data) {
                if (['dob', 'doj'].indexOf(key) !== -1){
                    if(!data[key] || (data[key].indexOf('Invalid') !== -1)){
                        data[key]= undefined;
                    }
                }
                orgUser.set(key, data[key]);
                orgUser.markModified(key);
            }
            orgUser.save((err)=>{
                if (err){
                    return next({...K.ERROR.MONGO_SAVE, details: err});
                }
                return next();
            });
        };

        const removeDirectReports= (next) =>{
            if (!oldReportsTo){
                return next();
            }
            if (newReportsTo && (newReportsTo._id.toString() === oldReportsTo._id.toString())){
                return next();
            }
            if (oldReportsTo.directReports.indexOf(orgUser._id) === -1) {
                return next();
            }
            let directReports= [];
            for (let index=0, numDirectReports=oldReportsTo.directReports.length; index<numDirectReports; index++){
                let reportId= oldReportsTo.directReports[index];
                if (reportId.toString() !== orgUser._id.toString()){
                    directReports.push(reportId);
                }
            }
            oldReportsTo.directReports= directReports;
            oldReportsTo.markModified('directReports');
            oldReportsTo.save(next);
        };

        const removeIndirectReports = (next) =>{
            if (!oldReportsTo){
                return next();
            }
            if (newReportsTo && (newReportsTo._id.toString() === oldReportsTo._id.toString())){
                return next();
            }
            let cond= {'$or': [{'directReports._id':oldReportsTo._id}, {'indirectReports._id': oldReportsTo._id}]};
            OrgUser.update(cond, {$pull: {indirectReports: orgUser._id}}, {multi: true}, (err)=>{
                return next();
            });
        };

        const addDirectReports= (next) =>{
            if (!newReportsTo){
                return next();
            }
            if (oldReportsTo && (newReportsTo._id.toString() === oldReportsTo._id.toString())){
                return next();
            }
            if (newReportsTo.directReports.indexOf(orgUser._id) !== -1) {
                return next();
            }
            newReportsTo.directReports.push(orgUser._id);
            newReportsTo.markModified('directReports');
            newReportsTo.save(next);
        };

        const addIndirectReports = (next) =>{
            if (!newReportsTo){
                return next();
            }
            if (oldReportsTo && (newReportsTo._id.toString() === oldReportsTo._id.toString())){
                return next();
            }
            let cond= {'$or': [{'directReports._id':newReportsTo._id}, {'indirectReports._id': newReportsTo._id}]};
            OrgUser.update(cond, {$addToSet: {indirectReports: orgUser._id}}, {multi:true}, (err)=>{
                return next();
            });
        };

        Async.series([
            loadOrgUnit,
            loadManagedUnit,
            loadLocalOrgUser,
            loadReportsTo,
            updateGlobalUser,
            updateLocalOrgUser,
            addDirectReports,
            addIndirectReports,
            removeDirectReports,
            removeIndirectReports
        ], (err)=>{
            console.error(err);
            return cb(undefined, orgUser);
        });
    };

    schemaObj.index({"name":1});
    schemaObj.index({"seqId":1});
    schemaObj.index({"contact.phoneNumber":1});
    schemaObj.index({"contact.altPhoneNumber":1});
    if (CollSettings.fields.code?.required){
        schemaObj.index({'code': 1}, {unique: true, sparse: true});
    }

    schemaObj.pre('save', function (next) {
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
        if (this.siteId){
            this.siteId= Mongoose.Types.ObjectId(this.siteId);
            this.site= this.siteId;
        }
        if (this.virtualRef?._id){
            this.siteId= this.virtualRef._id;
            this.site= this.siteId;
        }
        if (!this.isNew){
            return next();
        }
        Counter.getNextSequence(COLLECTION_NAME, (err, {seqId})=>{
            if (err){
                console.log(err);
                return next('error while getNextSequence!');
            }
            this.seqId= seqId;
            next();
        });
    });

    const OrgUser = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.OrgUser = OrgUser;

    OrgUser.syncIndexes();

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {}, (err)=>{
        doneCb(err);
    });
};
