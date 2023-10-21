/**
 * @desc - Stores the user actions/system actions on the data
 */
const mongoose = require('mongoose');
const Mongoose = require("mongoose");
const UAParser= require('ua-parser-js');
const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const EventLogSchema = require('../abstract/EventLog').schema();

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const schemaObj = new Schema(EventLogSchema);
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
        if (query.scopeId){
            query['scope._id']= Mongoose.Types.ObjectId(query.scopeId);
            delete query.scopeId;
        }
        if (query.scopeType){
            query['scope.sType']= query.scopeType;
            delete query.scopeType;
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

    schemaObj.post('save', function (doc,next) {
        const OrgUser= app.locals.models.OrgUser;
        OrgUser.findById(doc.doneBy?._id, (err, record)=>{
            if (err){
                return next();
            }
            if (!record){
                console.log('error: no orguser record found while trying to update last activity');
                return next();
            }
            record.lastActive= doc.createdOn;   //this is approx timestamp when the request is processed by server
            record.lastEvent= doc._id;
            if (doc.loc?.lng){
                record.lastLocation= {
                    ...doc.loc,
                    event: doc._id,
                    capturedAt: doc.when
                }
                record.markModified('lastLocation');
            }
            record.save(next);
        });
    });

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.index({'scope._id':1, 'scope.sType':1, when: -1});
    schemaObj.index({'doneBy._id':1});
    schemaObj.index({when:1, 'doneBy._id':1});

    app.locals.models.EventLog = Db.model('eventLog', schemaObj);

    return doneCb();
};
