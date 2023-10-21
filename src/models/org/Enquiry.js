/**
 * @desc - Stores the user actions/system actions on the data
 */
const mongoose = require('mongoose');
const Mongoose = require("mongoose");
const UAParser= require('ua-parser-js');
const Utils = require("../utils");
const otpGenerator = require("otp-generator");
const CollSchemaShort= Utils.CollSchemaShort;
const ContactSchema= Utils.ContactSchema;
const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const schemaObj = new Schema({
        name            : {
            type        : String
        },
        desc            : {
            type        : String,
            trim        : true
        },
        customer        : {
            title: {
                type: String,
                // enum: ['Mr', 'Ms', 'Mrs','Dr']
            },
            name: {
                type: String
            },
            contact: {...ContactSchema}
        },
        orgUnit         : {...CollSchemaShort},
        termsAndConditionsAccepted: {type:Boolean},
        termsAndConditionsAcceptedVersion: { type: String},
        details         : { },
        extras          : { },
        client          : { //latest Client, once auditlog gets implemented this may go as part of that.
            ua          : {
                type: String,
                required: true
            },
            ipAddress   : {
                type: String,
                required: true
            }
        },
        otp             : {
            type        : String,
            default     : function (){
                return otpGenerator.generate(4, {
                    digits: true,
                    lowerCaseAlphabets: false,
                    upperCaseAlphabets: false,
                    specialChars: false
                });
            }
        },
        lastOTPVerifiedAt   : {
            type            : Date
        },
        lastOTPTriggeredAt  : {
            type            : Date
        },
        numOTPTriggers      : {
            type            : Number,
            default         : 0
        },
        status          : {
            type        : String,
            default     : 'draft',
            enum        :['draft', 'open']
        }
    });

    const parser = new UAParser("user-agent"); // you need to pass the user-agent for nodejs
    schemaObj.virtual('deviceInfo').get(function() {
        if (!this.client?.ua){
            return {};
        }
        parser.setUA(this.client.ua);
        let deviceInfo=parser.getResult();
        // console.log(deviceInfo);
        return deviceInfo;
    });

    const formatQuery = function (query) {
        if (query.orgUnitId){
            query['orgUnit._id']= Mongoose.Types.ObjectId(query.orgUnitId);
            delete query.orgUnitId;
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

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.index({'orgUnit._id':1, status: 1, createdOn: -1});
    schemaObj.index({'customer.contact.phoneNumber':1, status:1}, {unique:true});
    // schemaObj.index({'customer.contact.email':1, status:1}, {unique:true});

    app.locals.models.Enquiry = Db.model('enquiry', schemaObj);

    return doneCb();
};
