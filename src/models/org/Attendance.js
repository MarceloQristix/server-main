const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Validator = require('validator');
const Async = require('async');
const Moment = require("moment");

const Utils = require('../utils');
const CollSchemaShort = Utils.CollSchemaShort;
const COLLECTION_NAME = 'attendance';

const ACTION = {
    PUNCH_IN: 'punchIn',
    PUNCH_OUT: 'punchOut'
};

module.exports = function (app,doneCb){
    const Db = app.locals.Db;
    const schemaObj = new Schema({
        user: {
            ...CollSchemaShort
        },
        day : { //day string of the deployment's timezone
            type: String,
            required:true
        },
        punchInTime: {
            type: Date,
            default: Date.now
        },
        punchOutTime: {
            type: Date
        },
        punchInLoc     : {
            lat         : {type: Number},
            lng         : {type: Number},
            capturedOn  : {type: Date}, //Comes from client for now its optional
        },
        punchOutLoc     : {
            lat         : {type: Number},
            lng         : {type: Number},
            capturedOn  : {type: Date}, //Comes from client for now its optional
        }
    });

    const formatQuery = function (query) {
        if(query.userId) {
            query['user._id']= Mongoose.Types.ObjectId(query.userId);
            delete query.userId;
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

    schemaObj.statics.markAttendance = function(by, action, inputData, cb) {
        const OrgUser= app.locals.models.OrgUser;
        const currTimeStamp= new Date();

        let data = inputData? { ...inputData }:{};    //loc
        let userId = data.userId || by.id;

        if (action === ACTION.PUNCH_OUT) {
            if (!data.punchOutTime){
                data.punchOutTime= currTimeStamp;
            }
            else {
                data.punchOutTime= Moment(data.punchOutTime).toDate();
            }
        }
        else if (action === ACTION.PUNCH_IN) {
            if (!data.punchInTime){
                data.punchInTime= currTimeStamp;
            }
            else {
                data.punchInTime= Moment(data.punchInTime).toDate();
            }
        }

        const loadAndUpdateOrgUser= (next) =>{
            OrgUser.findById(userId, (err, record)=>{
                if(err){
                    return next(err);
                }
                if (!record){
                    return next('user not found!');
                }
                if (data.loc){
                    record.latest_loc= {...data.loc};
                }
                record.lastActive= data.punchInTime||data.punchOutTime;
                try{
                    data.user = record.getShortForm();
                }
                catch(e){
                    console.log(e);
                }
                record.save(next);
            });
        };

        let attendance;

        const updateAttendance = next => {
            console.log('abt to update attendance!');
            const DateTime = app.locals.services.DateTime;
            let attendanceDay= DateTime.getMoment(data.punchInTime||data.punchOutTime);
            let dayStr= attendanceDay.format('YYYY-MM-DD');
            this.findOne({ 'user._id': userId, day: dayStr},(err,record) => {
                if(err) {
                    return next(err);
                }
                if(record) {
                    attendance= record;
                    attendance.lastModifiedBy= by.id;
                }
                else {
                    attendance= new this({createdBy:by.id, day:dayStr});
                }
                if (data.punchOutTime){
                    attendance.punchOutTime= data.punchOutTime;
                    attendance.punchOutLoc= data.loc? {...data.loc}: undefined;
                    attendance.markModified('punchOutLoc');
                }
                else if (data.punchInTime){
                    if (!attendance.punchInTime){
                        attendance.punchInTime= data.punchInTime;
                        attendance.punchInLoc= data.loc? {...data.loc}: undefined;
                        attendance.markModified('punchInLoc');
                    }
                }
                attendance.user= data.user;
                attendance.markModified('user');
                console.log('abt to save', attendance);
                return attendance.save(next);
            });
        };

        Async.series([ loadAndUpdateOrgUser, updateAttendance ],(err) => {
            return cb(err, attendance);
        });
    };

    schemaObj.statics.punchOut = function(by, data, cb) {
        this.markAttendance(by, ACTION.PUNCH_OUT, data, cb);
    };

    schemaObj.statics.punchIn = function(by, data, cb) {
        this.markAttendance(by, ACTION.PUNCH_IN, data, cb);
    };

    const Attendance = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Attendance = Attendance;

    schemaObj.index({'user._id': 1});

    return doneCb();
};
