const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Validator = require('validator');
const otpGenerator = require('otp-generator')
const Async = require("async");
const MaskEmailsPhones = require('mask-email-phone')

const crypto = require('crypto');
const randomstring = require("randomstring");
const Moment = require('moment');
const passportLocalMongoose = require('passport-local-mongoose');

const Utils = require('../utils');
const path = require("path");
const ContactSchema = Utils.ContactSchema;
// TODO: Need to update these constants to objects.
// SYS_ROLE= {SYSTEM: '_system'...} move to K.js if needed
const SYS_ROLES = [
    "_system",
    "_root",    // Back door entry (this is only with tech team)
    "_admin"    // Admin of the org (this shall be used by support)
];

const USER_STATUSES = [
    "pending",
    "active",
    "blocked"
];

const MSG = {
    USER_NOT_FOUND: "User not found",
    USER_BLOCKED: "User blocked",
    AWAITING_APPROVAL: "User Approval Pending.",
    AUTH_FAILED: "Authentication failed"
};

const AUTH_FAIL_CODE = {
    USER_NOT_FOUND: 1,
    USER_BLOCKED: 2,
    AWAITING_APPROVAL: 3,
    AUTH_FAILED: 4,
};

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Logger = app.locals.Logger;
    const Config = app.locals.Config;

    const generatePassword = function () {
        return randomstring.generate({
            length: 10,
            charset: 'numeric'
        });
    };

    const userSchema = new Schema({
        name: { //more of nick
            type: String,
            trim: true,
            required: true
        },
        firstName: {
            type: String,
            trim: true,
        },
        lastName: {
            type: String,
            trim: true,
        },
        uniqueId: {    //email id/mobile no
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: {unique: true},
        },
        status: {
            type: String,
            default: "pending",
            enum: USER_STATUSES
        },
        userType: {
            type: String,
            default: 'external',
            enum: ['internal', 'external', 'system']
        },
        role: { //admin, _admin, system, root, orgMember-- shall have a corresponding entry in orgUser of the org
            type: String,
            required: true,
            index: true
        },
        memberOrgs: [ObjectId],
        ownedOrgs: [ObjectId],

        passwordExpiresOn: {type: Date},

        token: {
            type: String,
            default: function () {
                return Math.round((new Date().valueOf() * Math.random())) + '';
            }
        },  //token is used for activation and forgot password cases

        tokenExpiresOn: {
            type: Date
        },

        hashedPassword: {
            type: String,
            required: true
        },
        salt: {
            type: String,
            required: true
        },
        email   : {
            type: String
        },
        phoneNumber: {
            type: String
        },

        contact: {...ContactSchema},

        lastActive: {type: Date},

        lastClientInfo: {//this is to save user agent and angular app version etc
            ua: {type: String},
            version: {type: String},
        },

        lastEmailStatus: {
            status: {type: String},
            status_desc: {type: String},
            when: {type: Date}
        },

        // This is for some notes added by admins, when some action is taken on the user.
        notes: {type: String},

        primaryDevice:  {
            firebaseRegistrationToken: String
        },

        otp: {
            type: String,
        },
        otpExpiresOn: {
            type: Date
        }
    });

    userSchema.method('getShortForm', function () {
        return {
            _id: this._id,
            name: this.name,
            uniqueId: this.uniqueId,
            role: this.role,
            userType: this.userType,
            status: this.status
        };
    });

    userSchema.method('sendOTP', function (done){
        const emailService = app.locals.services.Email;
        const otpEmailTemplate = path.join('./tpls/html','otp.ejs');

        let userEmail= '';
        let userName= this.name||this.firstName;
        let emailAssetsBaseUrl= `${app.locals.credentials.baseUrl}/images/email-assets/`;

        let userMobile= '';
        let otp= '';
        const from= 'account-services@qristix.com';
        let otpSent2= [];

        let successMessage= '';

        const checkMobileNumber= (next)=>{
            if (Validator.isMobilePhone(this.uniqueId)){
                userMobile= this.uniqueId;
                return next();
            }
            else if (Validator.isMobilePhone(this.phoneNumber||'')){
                userMobile= this.phoneNumber;
                return next();
            }
            else if (Validator.isMobilePhone(this.contact?.phoneNumber||'')){
                userMobile= this.contact.phoneNumber;
                return next();
            }
            return next();
        };

        const checkEmail= (next)=>{
            if (Validator.isEmail(this.uniqueId)){
                userEmail= this.uniqueId;
                return next();
            }
            if (this.email && Validator.isEmail(this.email)){
                userEmail= this.email;
                return next();
            }
            if (this.contact?.email && Validator.isEmail(this.contact.email)){
                userEmail= this.contact.email;
                return next();
            }
            return next();
        };

        const generateOTP= (next)=>{
            if (!userEmail && !userMobile){
                return next('No Email or Mobile number found!');
            }
            if (this.otp && (Moment(this.otpExpiresOn).diff(new Date(), 's')>=0)){
                otp= this.otp;
                return next();
            }
            this.otp= otpGenerator.generate(4, {
                digits: true,
                lowerCaseAlphabets: false,
                upperCaseAlphabets: false,
                specialChars: false
            });
            otp= this.otp;
            this.otpExpiresOn= Moment().add(10, 'minutes').toDate();
            this.save(next);
        };

        const doSendEmailOTP= (next)=>{
            if (!userEmail){
                return next();
            }
            let data= {
                userName,
                emailAssetsBaseUrl,
                otp
            };
            otpSent2.push(userEmail);
            emailService.sendEJS('Otp for QRisTix login', otpEmailTemplate, data, userEmail, from,function(err) {
                if(err){
                    console.log(`Error sending OTP Email to ${userEmail} ${err}`);
                    return next(err);
                }
                next();
            });
        };

        const doSendSMSOTP= (next)=>{
            if (!userMobile){
                return next();
            }
            otpSent2.push(userMobile);
            const LOGIN_OTP_TEMPLATE= {
                "name": "loginOTP",
                "id": "1407168171858584222",
                "text": "Hello, OTP to login to your QRisTix account is ${otp}. For security reasons, please do not share this OTP with anyone."
            };
            let subAccountConfig= app.locals.credentials.sms.subAccount;
            app.locals.services.SMS.send(userMobile, LOGIN_OTP_TEMPLATE, {otp}, next,
                {useSubAccount: true, config:subAccountConfig}
            );
        };

        let steps= [
            checkMobileNumber,
            checkEmail,
            generateOTP
        ];
        const smsEnabledOrgIds= [
            "617f4bcf0aa53c9dab93aa3a", //ttk
            "640d98b2847a1f2e0b68a18b", //tkm
        ];
        if (smsEnabledOrgIds.indexOf(this.memberOrgs[0].toString()) !== -1){
            steps.push(doSendSMSOTP)
        }
        steps.push(doSendEmailOTP);
        Async.series(steps, (err)=>{
            if (err){
                console.log('otp sending error for ', err);
                return done(err);
            }
            let successMessage= `Otp sent for user "${userName}" to ${otpSent2.join(', ')}`;
            console.log(successMessage);
            return done(undefined, {successMessage: MaskEmailsPhones(successMessage)});
        });
    });

    userSchema.method("getContactNo", function () {
        let record = this,
            phoneNo,
            phone = (record.phoneNumber || record.contact?.phone)|| "",
            altPhone = record.contact.altPhone || "";

        if (validator.isMobilePhone(record.uniqueId, "en-IN")) {
            phoneNo = record.uniqueId;
        }
        else if (validator.isMobilePhone(phone, "en-IN")) {
            phoneNo = phone;
        } else if (validator.isMobilePhone(altPhone, "en-IN")) {
            phoneNo = altPhone;
        } else {
            phoneNo = undefined;
        }
        return phoneNo;
    });

    const UNIQ_ID_REGEXP = /[^a-z0-9_.@\-]/gi;

    userSchema.pre('save', function (next) {
        let modifiedPaths = this.isNew ? ['uniqueId'] : this.modifiedPaths();
        if (!this.name){
            this.name = this.firstName;
        }

        if (modifiedPaths.indexOf("uniqueId") !== -1) {
            if (this.uniqueId) {
                this.uniqueId = this.uniqueId.replace(UNIQ_ID_REGEXP, '');
            }
        }

        if (this.isNew) {
            if (this.hashedPassword) {
                next();
            }
            else {
                if (!(this.password && this.password.length)) {
                    next("INVALID_PASSWORD");
                }
                else {
                    next();
                }
            }
        }
        else {
            next();
        }
    });

    userSchema.statics = {
        sendOTP: function (uniqueId, done){
            this.findOne({uniqueId}, (err, user)=>{
                if (err){
                    return done(err);
                }
                if (!user){
                    return done({message: 'Please check your user name for any typos and try again'});
                }
                user.sendOTP(done);
            });
        },
        processUniqId: function (str) {
            return str ? str.trim().toLowerCase().replace(UNIQ_ID_REGEXP, '') : '';
        },
        updateLastActive: function (id, when) {
            this.findByIdAndUpdate(id, {"lastActive": when || Date.now()}, function () {
            });
        },

        setPrimaryDevice : function (id, registrationToken, cb){
            let data= {
                primaryDevice: {
                    firebaseRegistrationToken: registrationToken
                }
            };
            this.findByIdAndUpdate(id, data, cb);
        },

        //user_id can be one of email, uniq_id or phone
        authenticate: function (userId, password, callback, noAuth) {
            const exitF = function (err, result) {
                callback(err, result);
            };
            this.findOne({uniqueId: userId}, function (err, user) {
                if (err) {
                    return exitF(err);
                }
                if (!user) {
                    return exitF(null, {
                        success: false,
                        message: MSG.USER_NOT_FOUND,
                        code: AUTH_FAIL_CODE.USER_NOT_FOUND
                    });
                }
                if (user.status !== "active") {
                    var msg = user.status === "pending" ? MSG.AWAITING_APPROVAL : (MSG.USER_BLOCKED + "::" + (user.note || ''));
                    var code = user.status === "pending" ? AUTH_FAIL_CODE.AWAITING_APPROVAL : AUTH_FAIL_CODE.USER_BLOCKED;
                    return exitF(null, {
                        success: false,
                        message: msg,
                        code: code
                    });
                }
                if (!noAuth && !password) {
                    return exitF(null, {success: false, message: "PASSWORD CANNOT BE EMPTY"});
                }
                if (noAuth || user.authenticate(password)) {
                    user.set("lastActive", new Date());
                    return exitF(null, {success: true, user: user.toObject()});
                }
                return exitF(null, {
                    success: false,
                    message: MSG.AUTH_FAILED,
                    code: AUTH_FAIL_CODE.AUTH_FAILED
                });
            });
        },

        updateStatus: function (by, id, status, note, callback) {
            var exitF = function (err, user) {
                callback(err, user);
            };
            this.findByIdAndUpdate(id, {status: status, note: note, lastModifiedBy: by}, function (err, user) {
                if (err) {
                    return exitF(err);
                }
                if (!user) {
                    return exitF("USER_NOT_FOUND");
                }
                return exitF(null, user);
            });
        },

        activate: function (by, id, data, callback) {
            this.findById(id, function (err, record) {
                if (err) {
                    return callback(err);
                }
                if (!record) {
                    return callback({code: 123, message: 'User not found!'});
                }
                record.status = 'active';
                record.note = data.note;
                record.lastModifiedBy = by.id;
                record.save(function (err) {
                    return callback(err, record);
                });
            });
        },

        deActivate: function (by, id, data, callback) {
            this.findById(id, function (err, record) {
                if (err) {
                    return callback(err);
                }
                if (!record) {
                    return callback("User not found!");
                }
                record.status = "blocked";
                record.note = data.note;
                record.last_modified_by = by.id;
                record.save((err) => {
                    let sessionsColl = app.locals.sessionStore.db.collection('sessions');
                    sessionsColl.find({'session.me.id': id}, {_id: 1}).toArray(function (err, records) {
                        if (err) {
                            Logger.error('Error while finding active sessions!');
                            Logger.error(err);
                        }
                        let destroySession = function (r, next) {
                            Logger.info(`Destroying session : ${r._id.toString()}`);
                            app.locals.sessionStore.destroy(r._id, next);
                        };
                        Async.eachSeries(records, destroySession);
                    });
                    return callback(err, record);
                });
            });
        },

        updateUser: function (by, id, data, callback) {
            var exitF = function (err, user) {
                callback(err, user);
            };
            data.lastModifiedBy = by;
            delete data.lastModifiedOn;
            this.findById(id, (err, user) => {
                if (err) {
                    return exitF(err);
                }
                if (!user) {
                    return exitF("User not found");
                }
                if (!data.password || (data.password === user.hashedPassword)) {
                    delete data.password;
                }

                for (var key in data) {
                    user.set(key, data[key]);
                }
                user.save(function (err) {
                    return exitF(err, user);
                });
                return 0;
            });
        },

        createUser: function (by, data, doneCb) {
            let UserModel = app.locals.models.User;
            let password = data.password || generatePassword();
            let newUser = new UserModel(data);
            newUser.createdBy = data.signup ? newUser._id : by;
            let expiryDate = Moment().add(Config.get('account.passwordExpiry'), 'd').toDate();
            newUser.set("passwordExpiresOn", data.passwordExpiresOn || expiryDate);
            newUser.setPassword(password, () => {
                newUser.save(function (err) {
                    return doneCb(err, newUser);
                });
            });
        },

        /**
         * @desc Creates a user if not exists, if exists just returns the user object
         * @param by
         * @param data
         * @param callback
         */
        createIfNotExists: function (by, data, doneCb) {
            if (!data.uniqueId) {
                return doneCb('Mandatory Param uniqueId missing!');
            }
            let where = {};
            if (data.uniqueId) {
                where.uniqueId = data.uniqueId;
            }
            this.findOne(where, (err, user) => {
                if (err) {
                    return doneCb(err);
                }
                if (user) {
                    return doneCb(undefined, user);
                }
                this.createUser(by, data, doneCb);
            });
        }
    };

    userSchema.statics.SYS_ROLES = SYS_ROLES;

    /** Passport related stuff below */
    let options = {
        usernameField: "uniqueId",
        saltField: "salt",
        hashField: "hashedPassword",
        lastLoginField: "lastLogin",
        attemptsField: "attempts",
        limitAttempts: Config.get('account.lockoutPolicy.limitAttempts'),
        maxAttempts: Config.get('account.lockoutPolicy.maxAttempts'),
        usernameLowerCase: true,
        digestAlgorithm: "sha1"
    };

    userSchema.plugin(passportLocalMongoose, options);

    /**
     * @description This overwrites passportLocalMongoose's serializeUser
     * @returns {Function}
     */
    userSchema.statics.serializeUser = function () {
        return function (user, cb) {
            let obj = user.toObject();
            let excludeFields = [
                "salt",
                "hashedPassword",
                "createdBy",
                "lastModifiedBy",
                "token",
                "lastModifiedOn",
                "createdOn",
                "globalUser",
                "digiCode"
            ];
            let orgId = (user.ownedOrgs&& user.ownedOrgs[0])?user.ownedOrgs[0]: (user.memberOrgs? user.memberOrgs[0]: undefined);
            if (!orgId) {
                return cb('no org mapped to the user!!'+orgId);
            }
            const Organization = app.locals.models.Organization;
            Organization.findById(orgId, (err, org)=>{
                if (err){
                    return cb('error while loading org info');
                }
                if (!org){
                    return cb(`no org found with orgId - ${orgId} `);
                }
                const orgSeqId= org.seqId;
                const orgApp = app.locals.orgs[orgSeqId];
                if (!orgApp){
                    return cb('error finding subApp: '+ orgId+':'+ orgSeqId);
                }
                const OrgUser = orgApp.locals.models.OrgUser;
                if (!OrgUser){
                    return cb('errror finding local user model>>'+ orgId +'>>' +orgSeqId);
                }
                OrgUser.findOne({'globalUser._id': user._id}, (err, orgUser)=>{
                    if (err){
                        return cb(err);
                    }
                    excludeFields.forEach(function (key) {
                        delete obj[key];
                    });
                    if (orgUser){
                        obj.orgMe = orgUser.toObject();
                        excludeFields.forEach(function (key) {
                            delete obj.orgMe[key];
                        });
                        let role= obj.orgMe.role;
                        let rolesDef= orgApp.locals.Settings.orgUser.roles;
                        for (let index=0, numRoles= rolesDef.length; index< numRoles; index++){
                            if (rolesDef[index].id === role){
                                obj.orgMe.access= {...rolesDef[index].access};
                                obj.orgMe.settings= {...rolesDef[index].settings};
                                obj.orgMe.roleWeight= rolesDef[index].weight;
                                break;
                            }
                        }
                    }
                    else {
                        obj.orgMe= {...obj};
                        obj.orgMe.role= 'admin';
                        obj.orgMe.access= orgApp.locals.allPermissions;
                        obj.orgMe.roleWeight= -1;
                    }
                    cb(null, obj);
                });
            });

        };
    };

    app.locals.models.User = Db.model('user', userSchema);

    return doneCb();
};
