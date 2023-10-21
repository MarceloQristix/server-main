const Moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(Moment);

const technicianDef = {
     "technicianJobSummary":   {
            id: 'technicianJobSummary',
            name: 'Technician Job summary',
            description: 'Matrix of Tickets / Work orders assigned to all technicians',
            type: 'raw',
            data: {
                collection: 'Ticket',
                condition: {
                },
                groupBy: {
                    _id: {id: '$assignee._id',name:'$assignee.name', code: '$assignee.code'},
                    completedJobs: {'$sum': {'$cond': [{$in: ['$status',['05_closed','04_resolved']]},1,0]}},
                    pendingJobs: {'$sum': {'$cond': [{$eq: ['$status','03_on_hold']},1,0]}},
                    newJobs: {'$sum': {'$cond': [{$eq: ['$status','01_open']},1,0]}},
                    inProgressJobs: {'$sum': {'$cond': [{$eq: ['$status','02_in_progress']},1,0]}},
                },
                projection: [
                    {
                        id: 'name', //field name in the collection
                        path: '_id.name',
                        name: 'Technician Name' //column name in xls
                    },
                    {
                        id: 'code',
                        path: '_id.code',
                        name: 'Technician Code'
                    },
                    {
                        id: 'completedJobs',
                        name: 'Completed Jobs'
                    },
                    {
                        id: 'pendingJobs',
                        name: 'Pending / On-hold Jobs'
                    },
                    {
                        id: 'inProgressJobs',
                        name: 'In Progress Jobs'
                    },
                    {
                        id: 'newJobs',
                        name: 'New Jobs'
                    },
                ]
            }
        },
        // {
        //     id: 'technicianPerformance',
        //     name: 'Technician Performance',
        //     description: 'Lists technician performance, productivity etc',
        //     filters: {
        //         dateRange: {
        //             startDate: {},
        //             endDate: {}
        //         }
        //     },
        //     type: 'custom',
        //     data: {
        //         collection: 'TktStats',
        //         condition: {
        //
        //         },
        //         groupBy: {
        //             _id: {
        //                 id: '$assignee._id',
        //                 name:'$assignee.name',
        //                 stype:'$stype',
        //                 status:'$status',
        //                 lastModified:'$lastModified'},
        //             backlog: {'$sum':
        //                     {'$cond': [
        //                         {'$and':[{$eq: ['$status','03_on_hold']},{'$ne':['$stype','pm']}]},1,0]}},
        //             assigned: {'$sum': {'$cond': [{'$ne':['$stype','pm']},1,0]}},
        //             completedSelf: {'$sum': {'$cond': [{'$and':[{$in: ['$status',['04_resolved','05_closed']]},{'$eq':['$lastModified','$id']},{'$ne':['$stype','pm']}]},1,0]}},
        //             completedOthers: {'$sum': {'$cond': [{'$and':[{$in: ['$status',['04_resolved','05_closed']]},{'$ne':['$lastModified','$id']},{'$ne':['$stype','pm']}]},1,0]}},
        //             cancelled: {'$sum': {'$cond': [{'$and':[{'$ne':['$stype','pm']}]},1,0]}},
        //             firstFix: {'$sum': {'$cond': [{'$and':[{$in: ['$status',['04_resolved','05_closed']]},{'pausedOn': {'$ifNull': [true,false]}},{'$ne':['$stype','pm']}]},1,0]}},
        //             repeatFix: {'$sum': {'$cond': [{'$and':[{$in: ['$status',['04_resolved','05_closed']]},{'pausedOn': {'$ifNull': [false,true]}},{'$ne':['$stype','pm']}]},1,0]}},
        //             tatExceeded: {'$sum': {'$cond': [{'$and':[{'$eq': ['isTATExceeded', true]},{'$ne':['$stype','pm']}]},1,0]}},
        //             backlogPm: {'$sum': {'$cond': [{'$and':[{$eq: ['$status','03_on_hold']},{'$eq':['$stype','pm']}]},1,0]}},
        //             assignedPm: {'$sum': {'$cond': [{'$eq':['$stype','pm']},1,0]}},
        //             completedSelfPm: {'$sum': {'$cond': [{'$and':[{$in: ['$status',['04_resolved','05_closed']]},{'$eq':['$lastModified','$id']},{'$eq':['$stype','pm']}]},1,0]}},
        //             completedOthersPm: {'$sum': {'$cond': [{'$and':[{$in: ['$status',['04_resolved','05_closed']]},{'$ne':['$lastModified','$id']},{'$eq':['$stype','pm']}]},1,0]}},
        //             cancelledPm: {'$sum': {'$cond': [{'$and':[{'$eq': ['$status','06_cancelled']},{'$eq':['$stype','pm']}]},1,0]}},
        //         },
        //         projection: [
        //             {
        //                 id: 'name', //field name in the collection
        //                 path: '_id.name',
        //                 name: 'Technician Name' //column name in xls
        //             },
        //             {
        //                 id: 'completedSelf',
        //                 name: 'Completed Self Jobs Non-Mandatory'
        //             },
        //             {
        //                 id: 'completedOthers',
        //                 name: 'Completed others Jobs Non-Mandatory'
        //             },
        //             {
        //                 id: 'allJobs',
        //                 name: 'Non-Mandatory Jobs assigned'
        //             },
        //             {
        //                 id: 'cancelledJobs',
        //                 name: 'Non-Mandatory Jobs Cancelled'
        //             },
        //             {
        //                 id: 'backlog',
        //                 name: 'Non-Mandatory Backlog'
        //             },
        //             {
        //                 id: 'firstFix',
        //                 name: 'First Fix %age',
        //                 fun:(firstFix,index,row) => {
        //                     return (firstFix/(row.repeatFix+row.firstFix))*100;
        //                 }
        //             },
        //             {
        //                 id: 'repeatFix',
        //                 name: 'Repeat Fix %age',
        //                 fun:(repeatFix,index,row) => {
        //                     return (repeatFix/(row.repeatFix+row.firstFix))*100;
        //                 }
        //             },
        //             {
        //                 id: 'tatExceeded',
        //                 name: 'TAT Exceeded %age',
        //                 fun:(tatExceeded,index,row) => {
        //                     return (tatExceeded/(row.repeatFix+row.firstFix))*100;
        //                 }
        //             },
        //             {
        //                 id: 'completedJobsPm',
        //                 name: 'Completed Self Jobs Mandatory'
        //             },
        //             {
        //                 id: 'completedOthersPm',
        //                 name: 'Completed others Jobs Mandatory'
        //             },
        //             {
        //                 id: 'allJobsPm',
        //                 name: 'Mandatory Jobs assigned'
        //             },
        //             {
        //                 id: 'cancelledJobsPm',
        //                 name: 'Mandatory Jobs Cancelled'
        //             },
        //             {
        //                 id: 'backlogPm',
        //                 name: 'Mandatory Backlog'
        //             }
        //         ]
        //     }
        // }
}

module.exports = technicianDef;