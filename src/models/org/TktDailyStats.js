
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Async = require("async");
const {TICKET_STATUS} = require("../abstract/Ticket");
const Excel = require("exceljs");

const COLLECTION_NAME = 'tktDailyStats';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;
    const TktDailyStatsSchema = {
        day: {
            type: String,   //format -- YYYY-DD-MM
            required: true,
        },
        entityType: {
            type: String,
            enum: ['orgUser'],
            required: true
        },
        entityId: {
            type: ObjectId,
            required: true
        },
        stats   : {
            //statid : number
            //consumablesCost
            //consumablesCostUnderContract
            //consumablesCost
        },
        metaData: {
            //statid: { entities: [], ids: [], codes: []}
        }
    };

    const schemaObj= new Schema(TktDailyStatsSchema);

    const formatQuery = function (query) {
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

    schemaObj.pre('save', function (next) {
        return next();
    });

    const getCountsDef= (startOfDay, endOfDay)=>{
        const COUNTS_DEF= [
            {
                id: 'toWork',
                label: 'Open tkt',
                info: 'Total tickets not closed on this day, (prev day not closed, freshly assinged on this day)',
                cond: {
                    $or: [
                        {
                            status: {$nin:[TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED]}
                        },   //open tickets at the end of the day
                        {
                            status: {$in:[TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED]},
                            completedOn: { $gte: startOfDay, $lte: endOfDay}
                        }
                    ]
                }
            },
            {
                id: 'workedOn', //move to activity log
                label: 'Worked On',
                isInternal: true,
                cond: {
                    lastModifiedOn: { $gte: startOfDay, $lte: endOfDay},
                    $or: [
                        {
                            status: {$nin:[TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED]}
                        },   //open tickets at the end of the day
                        {
                            status: {$in:[TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED]},
                            completedOn: { $gte: startOfDay, $lte: endOfDay}
                        }
                    ]
                }
            },
            {
                id: 'closed',
                label: 'Closed tkt',
                cond: {
                    status: TICKET_STATUS.CLOSED,
                    completedOn: { $gte: startOfDay, $lte: endOfDay}
                }
            },
            {
                id: 'assigned',
                label: 'Assigned',
                isInternal: true,
                cond: {
                    assignedOn: { $gte: startOfDay, $lte: endOfDay}
                }
            },
            {
                id: 'notClosed',
                label: 'Pending tkt',
                cond: {
                    status: {$nin:[TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED]}
                }
            },
            {
                id: 'cancelled',
                label: 'Cancelled tkt',
                cond: {
                    status: TICKET_STATUS.CANCELLED,
                    completedOn: { $gte: startOfDay, $lte: endOfDay}
                }
            }
        ];
        return COUNTS_DEF;
    };
    const DATE_FORMAT_SORTABLE= 'YYYY-MM-DD';

    schemaObj.statics.getTechnicianPerformanceData= function (startDay, endDay, cb) {
        const OrgUser= app.locals.models.OrgUser;
        const DateTime = app.locals.services.DateTime;

        const startDayStr= startDay ||app.locals.Settings.technicianPerformance.startDay;
        const endDayStr= endDay||DateTime.getMoment().subtract(1, 'day').format(DATE_FORMAT_SORTABLE);

        let technicianDayWiseRecords= {};
        let technicians= [];
        let def= [];
        let days= [];

        const loadDef= (next)=>{
            let countsDef= getCountsDef(startDayStr, endDayStr);
            countsDef.forEach((oneCountDef)=>{
                if(oneCountDef.isInternal){
                    return;
                }
                def.push(oneCountDef);
            });
            let prevDayStr= endDayStr;
            let prevDay;
            while(prevDayStr >= startDayStr){
                prevDay= DateTime.getMoment(prevDayStr, DATE_FORMAT_SORTABLE);
                days.push({
                    id: prevDayStr,
                    name: prevDay.format('D MMM')
                });
                prevDayStr= prevDay.subtract(1, 'day').format(DATE_FORMAT_SORTABLE);
            }
            return next();
        };

        const loadTechnicians= (next)=>{
            let cond= {
                "access": {"resource": "ticket", "action": "work"},
                role: {$nin:['business_head', 'manager']},
                "globalUser.status": "active"
            };
            OrgUser.find(cond, (err, records)=>{
                if(err){
                    return next();
                }
                technicians= records;
                return next();
            });
        };

        const loadStats= (next)=>{
            const loadDayStats= (day, next2)=>{
                this.find({day:day.id}, (err, records)=>{
                    if(err){
                        return next2(err);
                    }
                    let recordMap= {};
                    for (let index=0, numRecords=records.length; index< numRecords; index++){
                        recordMap[records[index].entityId.toString()]= records[index];
                    }
                    technicianDayWiseRecords[day.id]= recordMap;
                    return next2();
                });
            };
            Async.eachSeries(days, loadDayStats, next);
        };

        const getDCRFilePath= () =>{
            const baseUrl = `${app.locals.credentials.baseUrl}`;
            const orgSeqId = app.locals.id;
            return `${baseUrl}api/org/${orgSeqId}/report/open/DCR.xlsx`;
        };

        Async.series([loadDef, loadTechnicians, loadStats], (err)=>{
            if(err){
                return cb(err);
            }
            return cb(undefined, {
                def,
                days,
                technicianDayWiseRecords,
                technicians,
                dcrFileURL: getDCRFilePath()
            });
        });
    }

    schemaObj.statics.generateTechnicianPerformanceReport= function (startDay, endDay, cb) {
        const OrgUser= app.locals.models.OrgUser;
        const DateTime = app.locals.services.DateTime;

        const startDayStr= startDay ||app.locals.Settings.technicianPerformance.startDay;
        const endDayStr= endDay||DateTime.getMoment().subtract(1, 'day').format(DATE_FORMAT_SORTABLE);

        let technicianDayWiseRecords= {};
        let technicians= [];
        let def= [];
        let days= [];

        const loadDef= (next)=>{
            let countsDef= getCountsDef(startDayStr, endDayStr);
            countsDef.forEach((oneCountDef)=>{
                if(oneCountDef.isInternal){
                    return;
                }
                def.push(oneCountDef);
            });
            let nextDayStr= startDayStr;
            let nextDay;
            while(nextDayStr <= endDayStr){
                nextDay= DateTime.getMoment(nextDayStr, DATE_FORMAT_SORTABLE);
                days.push({
                    id: nextDayStr,
                    name: nextDay.format('D MMM')
                });
                nextDayStr= nextDay.add(1, 'day').format(DATE_FORMAT_SORTABLE);
            }
            return next();
        };

        const loadTechnicians= (next)=>{
            OrgUser.find({"access": {"resource": "ticket", "action": "work"}}, (err, records)=>{
                if(err){
                    return next();
                }
                technicians= records;
                return next();
            });
        };

        const loadStats= (next)=>{
            const loadDayStats= (day, next2)=>{
                this.find({day:day.id}, (err, records)=>{
                    if(err){
                        return next2(err);
                    }
                    let recordMap= {};
                    for (let index=0, numRecords=records.length; index< numRecords; index++){
                        recordMap[records[index].entityId.toString()]= records[index];
                    }
                    technicianDayWiseRecords[day.id]= recordMap;
                    return next2();
                });
            };
            Async.eachSeries(days, loadDayStats, next);
        };

        const writeToFile = (next) => {
            const workbook =new Excel.Workbook();
            const worksheet = workbook.addWorksheet('Report');
            const columns = [];

            worksheet.columns = columns;
            worksheet.addRows(records);
            workbook.xlsx.writeFile('DCR.xlsx')
                .then(() => {
                    this.updateStatus(by, 'generated', next);
                })
                .catch(err => {
                    this.updateStatus(by,'failed',next);
                    return next(err);
                });
        };


        Async.series([loadDef, loadTechnicians, loadStats, writeToFile], (err)=>{
            if(err){
                return cb(err);
            }
            return cb(undefined, {
                def,
                days,
                technicianDayWiseRecords,
                technicians
            });
        });
    }

    schemaObj.statics.computeDailyTechnicianStats = function (by, cb) {
        const Ticket= app.locals.models.Ticket;
        const OrgUser= app.locals.models.OrgUser;
        const DateTime = app.locals.services.DateTime;
        const startOfDay= DateTime.getMoment().subtract(1, 'day').startOf('day').toDate();
        const endOfDay= DateTime.getMoment().subtract(1, 'day').endOf('day').toDate();
        let countsDef= getCountsDef(startOfDay, endOfDay);
        let technicians= [];
        let day= DateTime.getMoment().subtract(1, 'day').startOf('day').format(DATE_FORMAT_SORTABLE);

        const loadTechnicians= (next)=>{
            OrgUser.find({"access": {"resource": "ticket", "action": "work"}}, (err, records)=>{
                if(err){
                    return next(err);
                }
                technicians= records;
                return next();
            });
        };

        const computeStats= (next)=>{
            const calculateCountsTechnicianWise= (technician, next2) =>{
                let stats= {};
                let metaData= {};
                const baseCond= {
                    'assignee._id': technician._id
                };
                const doCalculate= (def, next3)=>{
                    let cond= {...baseCond, ...def.cond};
                    Ticket.distinct('_id', cond, (err, ids)=>{
                        if(err){
                            return next3(err);
                        }
                        let statId= def.id;
                        stats[statId]= ids.length;
                        metaData[statId]= {
                            ids: ids
                        };
                        if (ids.length===0){
                            return next3();
                        }
                        Ticket.find({_id:{$in:ids}}, {_id:1, code:1}, (err, entities)=>{
                            metaData[statId].entities= [];
                            entities.forEach((entity)=>{
                                metaData[statId].entities.push({_id: entity._id, code: entity.code});
                            });
                            return next3();
                        });
                    });
                };
                Async.eachSeries(countsDef, doCalculate, (err)=>{
                    if(err){
                        return next2(err);
                    }
                    //TODO: Save stats into db
                    let statRecord= new TktDailyStats({
                        day,
                        createdBy: by._id,
                        entityType: 'orgUser',
                        entityId: technician._id,
                        stats,
                        metaData
                    });
                    return statRecord.save(next2);
                });
            };
            Async.eachSeries(technicians, calculateCountsTechnicianWise, next);
        };

        Async.series([
            loadTechnicians,
            computeStats
        ], (err)=>{
            console.log('...>',err);
            cb(err);
        });
    };

    const TktDailyStats = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.TktStats = TktDailyStats;

    schemaObj.index({day: 1, entityId: 1}, {unique: true});

    TktDailyStats.syncIndexes();

    doneCb();
};
