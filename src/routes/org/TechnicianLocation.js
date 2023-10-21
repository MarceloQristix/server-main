const Async= require('async');
const K = require("../../K");
const Mongoose = require("mongoose");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class TechnicianLocation extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'technician-location'].join('/'), app.locals.models.EventLog, true);
            this.router.get('/', this.findAll.bind(this));
            this.router.get('/:id', this.findById.bind(this));
            this.setRoutes(false);
        }

        findAll(req, res) {
            const DateTime= app.locals.services.DateTime;
            const EventLog= app.locals.models.EventLog;
            const OrgUser= app.locals.models.OrgUser;

            let technicians= [];
            let todayStart= DateTime.getMoment().startOf('day').toDate();
            let lastEventIds= [];
            let todayLastEventMap= {};

            const loadTechnicians= (next)=>{
                let cond= {uType: 'technician'};
                OrgUser.find(cond, (err, records)=>{
                    if(err){
                        return next();
                    }
                    technicians= records;
                    let lastEventIdMap= {};
                    records.forEach((record)=>{
                        if (record.lastEvent){
                            lastEventIdMap[record.lastEvent]= record.lastEvent;
                        }
                        if (record.lastLocation && record.lastLocation?.event){
                            lastEventIdMap[record.lastLocation.event]= record.lastLocation.event;
                        }
                    });
                    lastEventIds= Object.keys(lastEventIdMap);
                    return next();
                });
            };

            const loadLocationEvents= (next)=>{
                EventLog.find({_id: {$in:lastEventIds}, when: {$gte: todayStart}}, (err, events)=>{
                    if(err){
                        return next(err);
                    }
                    events.forEach((event)=>{
                        todayLastEventMap[event._id.toString()]= event;
                    });
                    return next();
                });
            };

            const steps=[
                loadTechnicians,
                loadLocationEvents,
            ];

            Async.series(steps, (err)=>{
                if (err){
                    res.error(err);
                    return;
                }
                let result= [];
                technicians.forEach((technician)=>{
                    let isPresent= false;
                    if (technician.lastEvent && todayLastEventMap[technician.lastEvent.toString()]){
                        isPresent= true;
                    }
                    let isLocActiveToday= false;
                    if (technician.lastLocation?.lng && todayLastEventMap[technician.lastLocation.event.toString()]){
                        isLocActiveToday= true
                    }
                    result.push({
                        ...technician.toObject(),
                        isPresent,
                        isLocActiveToday
                    });
                })
                res.success(result);
            });
        }

        findById(req, res) {
            const DateTime= app.locals.services.DateTime;
            const EventLog= app.locals.models.EventLog;
            let todayStart= DateTime.getMoment().startOf('day').toDate();

            let locationsToday= [];
            let id= req.params.id;
            const loadTodayLocations= (next)=>{
                let cond={
                    when: {$gte: todayStart},
                    'doneBy._id': Mongoose.Types.ObjectId(id),
                    'loc.lng': {$exists:true}
                };
                EventLog.find(cond, {}, {sort:{when:-1}}, (err, records)=>{
                    if(err){
                        return next(err);
                    }
                    locationsToday= records;
                    return next();
                });
            };

            Async.series([loadTodayLocations], (err)=>{
                if(err){
                    return res.error(err);
                }
                return res.success({
                    _id: id,
                    id: id,
                    locationsToday
                });
            });
        }
    }

    return TechnicianLocation;
};
