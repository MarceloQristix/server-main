const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Async = require('async');
const RandomString = require("randomstring");

const Utils = require('../utils');
const AddressSchema = Utils.AddressSchema;

const COLLECTION_NAME = 'organization';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Config = app.locals.Config;

    const orgSchema = new Schema({
        name: { //Business name of the org
            type: String,
            required: true
        },
        code: { //Alpha numeric, generated via cyrpto random
            type: String,
            required: true,
            unique: true,
            index: true
        },
        seqId: {
            type: Number,
            unique: true
        },
        shortName: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        address: {...AddressSchema},
        settings: {
            defaultTimeZone: {
                type: String
            }
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        }
    });

    orgSchema.statics.isInitialized= function (){
        console.log('initstatus', this.counterInitStatus);
        return this.counterInitStatus;
    };

    orgSchema.statics.setInitialized= function (){
        this.counterInitStatus= true;
    };

    orgSchema.statics.createIfNotExists = function (by, orgData, doneCb) {
        const User = app.locals.models.User;
        const Counter = app.locals.models.Counter;
        const orgAdminPasswordPrefix = app.locals.credentials.orgAdminPasswordPrefix;
        let suffix= '';

        let org;

        const initCounterIfNotDone = (next) =>{
            if (Organization.isInitialized()) {
                return next();
            }
            const Counter = app.locals.models.Counter;
            const sysUser = app.locals.sysUser;

            console.log('about to call init count4er');
            Organization.count({}, (err, count)=>{
                Counter.initCounter(sysUser._id, COLLECTION_NAME, count, {}, (err)=>{
                    console.log('init counter returned')
                    if (!err){
                        Organization.setInitialized();
                    }
                    return next(err);
                });
            });
        }

        const createOrgIfNotExists = (next) => {
            this.findOne({code: orgData.code}, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (record) {
                    org = record;
                    return next();
                }
                Counter.getNextSequence(COLLECTION_NAME, (err, {seqId})=>{
                    if (err) {
                        return next(err);
                    }
                    orgData.seqId= seqId;
                    org = new this({
                        name: orgData.name,
                        shortName: orgData.shortName,
                        code: orgData.code,
                        seqId: orgData.seqId
                    });
                    org.createdBy = by;
                    org.save(next);
                });
            });
        };

        const createAdminUsersIfNotExist = (next) => {
            suffix= orgData.useShortName? orgData.shortName: org.seqId;
            const uniqueId= `admin.${suffix}@${Config.get('internalUserEmailDomain')}`;
            User.findOne({uniqueId: uniqueId}, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (record) {
                    return next();
                }
                let data = {
                    role: '_admin',
                    name: 'Admin',
                    status: 'active',
                    uniqueId: uniqueId,
                    ownedOrgs: [org._id],
                    memberOrgs: [org._id],
                    password: orgAdminPasswordPrefix + suffix
                };
                User.createIfNotExists(by, data, next);
            });
        };

        const createOrgUserIfNotExist = (next) => {
            if (!orgData.owner){
                return next();
            }
            const uniqueId= orgData.owner.uniqueId;
            User.findOne({uniqueId: uniqueId}, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (record) {
                    return next();
                }
                let data = {
                    role: 'admin',
                    name: orgData.owner.name||'Admin1',
                    status: 'active',
                    uniqueId: uniqueId,
                    ownedOrgs: [org._id],
                    memberOrgs: [org._id],
                    password: RandomString.generate({length:6, charset: 'numeric'})
                };
                console.log('>>>>>>>>>>>>>>>>>Owner password: ',data.password);
                User.createIfNotExists(by, data, next);
            });
        };

        const createGuestUserIfNotExist = (next) => {
            const uniqueId= `guest.${suffix}@${Config.get('internalUserEmailDomain')}`;
            User.findOne({uniqueId: uniqueId}, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (record) {
                    return next();
                }
                let data = {
                    role: '_guest',
                    name: 'Guest',
                    status: 'active',
                    uniqueId: uniqueId,
                    ownedOrgs: [],
                    memberOrgs: [org._id],
                    password: RandomString.generate({length:6, charset: 'numeric'})
                };
                User.createIfNotExists(by, data, next);
            });
        };

        const addOrg2RootUserIfNotAdded = (next) => {
            let data2Update = {
                $addToSet: {ownedOrgs: org._id, memberOrgs: org._id}
            };

            User.findOneAndUpdate({uniqueId: 'root'}, data2Update, (err, record) => {
                if (err) {
                    return next(err);
                }
                if (!record) {
                    return next('Root User Not Found!!!');
                }
                return next();
            });
        };

        Async.series([
                initCounterIfNotDone,
                createOrgIfNotExists,
                createAdminUsersIfNotExist,
                createOrgUserIfNotExist,
                createGuestUserIfNotExist,
                addOrg2RootUserIfNotAdded,
            ],
            doneCb);
    };

    const Organization = Db.model('organization', orgSchema);
    app.locals.models.Organization= Organization;
    doneCb();

};
