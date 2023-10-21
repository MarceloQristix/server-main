const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Moment= require('moment');
const Utils = require("../utils");
const CollSchemaShort = Utils.CollSchemaShort;

const COLLECTION_NAME = 'orgUnitRunningStats';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const OrgUnitRunningStatsSchema = {
        orgUnitId: {
            type: ObjectId,
            required: true
        },
        orgUnit: {
            ...CollSchemaShort
        },
        events: {
            //event: value
            lastCommunicationTriggeredAt: Date,
            lastUpdatesUploadedAt: Date
        },
        stats   : {
            activeBookings: Number,
            pendingUpdates: Number,
            pendingCommunication: Number
            //statid : number
        },
        metaData: {
            //statid: { entities: [], ids: [], codes: []}
        }
    };

    const schemaObj= new Schema(OrgUnitRunningStatsSchema);

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    const formatQuery = function (query) {
        if(query.q){
            query['$text']= {$search: query.q}
            delete query.q;
        }
        query['stats.activeBookings']= {$gt:0};
        switch (query.updateStatus){
            case 'noActiveBookings':
                query['stats.activeBookings']= 0;
                break;
            case 'notTriggeredInLastMonth':
                query['events.lastCommunicationTriggeredAt']= {$lte:Moment().subtract(30,'d').toDate()};
                break;
            case 'triggeredInLastMonth':
                query['events.lastCommunicationTriggeredAt']= {$gt:Moment().subtract(30,'d').toDate()};
                break;
        }
        delete query.updateStatus;
        return query;
    };

    schemaObj.pre('find', function(next) {
        if (!this.options){
            this.options= {};
        }
        this.options.sort = {'events.lastCommunicationTriggeredAt':-1};
        this.setQuery(formatQuery(this.getQuery()));
        next();
    });

    schemaObj.pre('count', function() {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('countDocuments', function() {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('save', function (next) {
        return next();
    });

    const DATE_FORMAT_SORTABLE= 'YYYY-MM-DD';

    schemaObj.statics.computeStats= async function (by){
        const OrgUnit= app.locals.models.OrgUnit;
        const Asset= app.locals.models.Asset;
        const OrgUnitRunningStats= this;
        const aMonthAgo= Moment().subtract(30,'d').toDate();

        const doComputeAndSave= async (orgUnit, dealershipIds)=>{
            let baseCond= {'orgUnit._id': {$in: dealershipIds}, status: {$in:['accepted', 'booked']}}
            let activeBookings= await Asset.count(baseCond);

            let cond4PendingUpdates= {
                ...baseCond,
                $or: [
                    {
                        lastStatusUpdateTriggeredOn: {$exists: false}
                    },
                    {
                        lastStatusUpdateTriggeredOn: {$lte: aMonthAgo}
                    }
                ]
            };
            let pendingUpdates= await Asset.count(cond4PendingUpdates);

            let cond4PendingCommunication= {
                ...baseCond,
                isLatestStatusUpdateTriggered:false,
                lastStatusUpdateTriggeredOn: {$lte: aMonthAgo}
            };
            let pendingCommunication= await Asset.count(cond4PendingCommunication);
            let latestBooking4StatusUpdateSent= await Asset.findOne(baseCond, {}, {sort:{lastStatusUpdateTriggeredOn:-1}});
            let doc= await OrgUnitRunningStats.findOne({orgUnitId:orgUnit._id});
            if (!doc){
                doc= new OrgUnitRunningStats({
                    orgUnitId: orgUnit._id,
                    createdBy:by._id
                });
            }

            doc.orgUnit= orgUnit.getShortForm();
            doc.markModified('orgUnit');

            if (latestBooking4StatusUpdateSent){
                doc.events= {
                    lastCommunicationTriggeredAt: latestBooking4StatusUpdateSent.lastStatusUpdateTriggeredOn
                };
                doc.markModified('events');
            }

            doc.stats= {
                activeBookings,
                pendingUpdates,
                pendingCommunication
            };
            doc.markModified('stats');
            await doc.save();
        };

        let groupDealerships= await OrgUnit.find({orgUnitType: 'groupDealership'});

        for (const gd of groupDealerships) {
            let dealershipIds= [];
            let dealerships= await OrgUnit.find({orgUnitType: 'dealership', 'parent._id': gd._id});
            for(const d of dealerships){
                dealershipIds.push(d._id);
                await doComputeAndSave(d, [d._id]);
            }
            await doComputeAndSave(gd, dealershipIds);
        }
    };

    const OrgUnitRunningStats = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.OrgUnitRunningStats = OrgUnitRunningStats;

    schemaObj.index({orgUnitId: 1}, {unique: true});
    schemaObj.index({'orgUnit.name': 'text', 'orgUnit.code': 'text'});

    OrgUnitRunningStats.syncIndexes();

    doneCb();
};
