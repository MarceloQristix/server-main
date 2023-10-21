const Moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(Moment);

const ticketStatus = {
    '01_open': 'Open',
    '02_in_progress': 'In Progress',
    '03_on_hold': 'Pending',
    '04_resolved': 'Resolved',
    '05_closed': 'Closed',
    '06_cancelled': 'Cancelled'
};

const ticketTypes = {
    'breakdown': 'Breakdown',
    'pm': 'Preventive Maintenance',
    'pd': 'Periodic Maintenance',
    'installation': 'Installation',
    'inspection': 'Inspection',
    'consumable_req': 'Consumables Request',
    'support': 'Support Request'
};

const sourceTypes = {
    "customer_generated": "Customer",
    "help_desk_created": "Help-Desk",
    "system_generated": "System",
}

const formatDateTime = function (val) {
    //dd/mm/yy hh:mm (24 hrs)
    return val ? Moment(val).format('DD/MM/YY HH:MM') : '--';
}

const formatMeterReadings = function (val, index, record) {
    let meterReadings = val || [];
    if (meterReadings.length === 0) {
        meterReadings = record.meterReadings || [];
    }
    if (meterReadings.length === 0) {
        return '--';
    }
    let meterReadingTextValues = [];
    for (let reading of meterReadings) {
        meterReadingTextValues.push(reading.name + '-' + reading.reading);
    }
    return meterReadingTextValues.join(';');
}

const ticketReports = {
    "newTickets": {
        id: 'newTickets',
        name: 'New Tickets',
        description: 'Lists all tickets/work-orders where has not started yet.',
        type: 'raw',
        data: {
            collection: 'Ticket',
            condition: {
                status: {$nin: ['05_closed', '03_on_hold']},
            },
            projection: [
                {
                    id: 'code',
                    name: 'TicketNo'
                },
                {
                    id: 'sType',
                    name: 'Type',
                    fun: (value) => ticketTypes[value]
                },
                {
                    path: 'customer.name',
                    id: 'customerName',
                    name: 'Customer'
                },
                {
                    id: 'source',
                    name: 'Source',
                    fun: (src) => {
                        return sourceTypes[src];
                    }
                },
                {
                    path: 'asset.code',
                    id: 'assetCode',
                    name: 'Asset Code'
                },
                {
                    path: 'asset.serialNumber',
                    id: 'assetSerialNumber',
                    name: 'Asset Serial-number'
                },
                {
                    path: 'asset.name',
                    id: 'assetName',
                    name: 'Product and Model No'
                },
                {
                    id: 'desc',
                    name: 'Description'
                },
                {
                    id: 'createdOn',
                    name: 'CreatedOn',
                    fun: formatDateTime
                },
                {
                    featureFlag: 'site.isEnabled',
                    path: 'asset.site',
                    id: 'branch',
                    name: 'Branch'
                },
                {
                    path: 'assignee.name',
                    id: 'techName',
                    stringId: 'technician',
                    name: 'Technician'
                },
                {
                    id: 'status',
                    name: 'Status',
                    fun: (value) => ticketStatus[value]
                }
            ]
        }
    },
    "onHoldTickets": {
        id: 'onHoldTickets',
        name: 'On-Hold Tickets',
        description: 'Lists all tickets/work-orders which are on-hold/pending',
        type: 'raw',
        data: {
            collection: 'Ticket',
            condition: {
                status: {$eq: '03_on_hold'},
            },
            projection: [
                {
                    id: 'code',
                    name: 'TicketNo'
                },
                {
                    id: 'sType',
                    name: 'Type',
                    fun: (value) => ticketTypes[value]
                },
                {
                    path: 'customer.name',
                    id: 'customerName',
                    name: 'Customer'
                },
                {
                    id: 'source',
                    name: 'Source',
                    fun: (src) => {
                        return sourceTypes[src];
                    }
                },
                {
                    path: 'asset.name',
                    id: 'assetName',
                    name: 'Product and Model No'
                },
                {
                    id: 'desc',
                    name: 'Description'
                },
                {
                    id: 'createdOn',
                    name: 'CreatedOn'
                },
                {
                    path: 'asset.site',
                    id: 'branch',
                    name: 'Branch'
                },
                {
                    path: 'assignee.name',
                    id: 'techName',
                    name: 'Technician'
                },
                {
                    id: 'status',
                    name: 'Status',
                    fun: (value) => ticketStatus[value]
                }
            ]
        }
    },
    "closedTickets": {
        id: 'closedTickets',
        name: 'Closed Tickets',
        description: 'Lists all tickets/work-orders that have been closed',
        type: 'raw',
        filters: {
            dateRange: {
                startDate: {},
                endDate: {}
            }
        },
        data: {
            collection: 'Ticket',
            condition: {
                status: {$eq: '05_closed'},
                completedOn: {$gte: '{{startDate}}', $lte: '{{endDate}}'}
            },
            projection: [
                {
                    id: 'code',
                    name: 'TicketNo'
                },
                {
                    id: 'sType',
                    name: 'Type',
                    fun: (value) => ticketTypes[value]
                },
                {
                    id: 'source',
                    name: 'Source',
                    fun: (src) => {
                        return sourceTypes[src];
                    }
                },
                {
                    id: 'createdOn',
                    name: 'CreatedOn',
                    fun: (createdOn) => {
                        return formatDateTime(createdOn);
                    }
                },
                {
                    path: 'customer.name',
                    id: 'customerName',
                    name: 'Customer'
                },
                {
                    path: 'asset.code',
                    id: 'assetCode',
                    name: 'Asset Code'
                },
                {
                    path: 'asset.serialNumber',
                    id: 'assetSerialNumber',
                    name: 'Asset Serial-number'
                },
                {
                    path: 'asset.name',
                    id: 'assetName',
                    name: 'Product and Model No'
                },
                {
                    featureFlag: 'product.hasMeters',
                    path: 'meterReadings',
                    id: 'meterReadings'
                },
                {
                    featureFlag: 'product.hasMeters',
                    path: 'asset.meterReadings',
                    id: 'oldMeterReadings',
                    name: 'Meter Readings',
                    fun: formatMeterReadings
                },
                {
                    id: 'desc',
                    name: 'Description'
                },
                {
                    featureFlag: 'site.isEnabled',
                    path: 'asset.site',
                    id: 'branch',
                    name: 'Branch'
                },
                {
                    path: 'assignee.name',
                    id: 'techName',
                    name: 'Technician'
                },
                {
                    id: 'status',
                    name: 'Status',
                    fun: (value) => ticketStatus[value]
                },
                {
                    id: 'completedOn',
                    name: 'Completed On',
                    fun: (completedOn) => {
                        return formatDateTime(completedOn);
                    }
                },
                {
                    id: 'closedBy',
                    name: 'Closed By',
                    path: 'lastEvent.doneBy',
                    fun: (doneBy) => {
                        return doneBy?.name;
                    }
                },
                {
                    id: 'repairType',
                    path: 'closure',
                    stringId: 'report.closureRemarks',
                    name: 'Repair Type',
                    fun: (type) => {
                        return type?.remarks
                    }
                },
                {
                    id: 'age',
                    name: 'Age',
                    fun: (obj, index, originalRecord) => {
                        let start = Moment(originalRecord.createdOn);
                        let end = Moment(originalRecord.completedOn);
                        let duration = Moment.duration(end.diff(start));
                        return duration.asHours() < 24 ? Math.round(duration.asHours()) + ' hours' : duration.asDays().toFixed(1) + ' days';
                    }
                },
                {
                    id: 'responseTime',
                    name: 'Response Time',
                    fun: (rt, index, originalRecord) => {
                        let start = Moment(originalRecord.createdOn);
                        let end = Moment(originalRecord.lastEvent ? originalRecord.lastEvent.when : originalRecord.completedOn);
                        let duration = Moment.duration(end.diff(start));
                        return duration.asHours() < 24 ? Math.round(duration.asHours()) + ' hours' : duration.asDays().toFixed(1) + ' days';
                    }
                }
            ]
        }
    },
    "repeatTickets": {
        id: 'repeatTickets',
        name: 'Repeat Tickets',
        description: 'Lists all tickets/work-orders that where the same issue/problem reappears within a stipulated time',
        type: 'raw',
        data: {
            collection: 'Ticket',
            condition: {
                sType: {$in: ['support', 'breakdown']}
            },
            groupBy: {
                '_id': {
                    assetName: '$asset.name',
                    customerName: '$customer.name',
                    serialNumber: '$asset.serialNumber',
                    model: '$asset.model',
                    locatedAt: '$asset.locatedAt'
                },
                repeatCount: {'$sum': 1}
            },
            accumulatorCheck: {
                $match: {repeatCount: {$gt: 1}}
            },
            projection: [
                {
                    id: 'assetName', //field name in the collection
                    path: '_id.assetName',
                    name: 'Name' //column name in xls
                },
                {
                    id: 'model',
                    name: 'Product Model',
                    path: '_id.model.name'
                },
                {
                    id: 'code',
                    name: 'Product Code',
                    path: '_id.model.code'
                },
                {
                    path: '_id.serialNumber',
                    id: 'serialNumber',
                    name: 'Asset Serial No'
                },
                {
                    path: '_id.customerName',
                    id: 'customerName',
                    name: 'Customer'
                },
                {
                    id: 'LocatedAt',
                    name: 'Located At',
                    path: '_id.locatedAt'
                },
                {
                    id: 'repeatCount',
                    name: 'No of times repeated',
                }
            ]
        }
    },
    "dailyTicketsReport": {
        id: 'dailyTicketsReport',
        name: 'Daily Ticket Report',
        description: 'Lists all tickets/work-orders that have been closed today and not closed as of now',
        type: 'raw',
        data: {
            collection: 'Ticket',
            filters: {},
            condition: {
                sType: {$ne: 'pm'},
                "$or": [
                    {
                        status: {$eq: '05_closed'},
                        completedOn: {$gte: '{{todayStartOfDay}}', $lte: '{{todayEndOfDay}}'}
                    },
                    {
                        status: {$nin: ['05_closed', '06_cancelled']},
                    }
                ]
            },
            projection: [
                {
                    id: 'code',
                    name: 'TicketNo'
                },
                {
                    id: 'sType',
                    name: 'Type',
                    fun: (value) => ticketTypes[value]
                },
                {
                    id: 'source',
                    name: 'Source',
                    fun: (src) => {
                        return sourceTypes[src];
                    }
                },
                {
                    id: 'createdOn',
                    name: 'CreatedOn',
                    fun: (createdOn) => {
                        return formatDateTime(createdOn);
                    }
                },
                {
                    path: 'customer.name',
                    id: 'customerName',
                    name: 'Customer'
                },
                {
                    path: 'asset.code',
                    id: 'assetCode',
                    name: 'Asset Code'
                },
                {
                    path: 'asset.serialNumber',
                    id: 'assetSerialNumber',
                    name: 'Asset Serial-number'
                },
                {
                    path: 'asset.name',
                    id: 'assetName',
                    name: 'Product and Model No'
                },
                {
                    featureFlag: 'product.hasMeters',
                    path: 'meterReadings',
                    id: 'meterReadings'
                },
                {
                    featureFlag: 'product.hasMeters',
                    path: 'asset.meterReadings',
                    id: 'oldMeterReadings',
                    name: 'Meter Readings',
                    fun: formatMeterReadings
                },
                {
                    id: 'desc',
                    name: 'Description'
                },
                {
                    featureFlag: 'site.isEnabled',
                    path: 'asset.site',
                    id: 'branch',
                    name: 'Branch'
                },
                {
                    path: 'assignee.name',
                    id: 'techName',
                    name: 'Technician'
                },
                {
                    id: 'status',
                    name: 'Status',
                    fun: (value) => ticketStatus[value]
                },
                {
                    id: 'completedOn',
                    name: 'Completed On',
                    fun: (completedOn) => {
                        return formatDateTime(completedOn);
                    }
                },
                {
                    id: 'closedBy',
                    name: 'Closed By',
                    path: 'assignee.name'
                },
                {
                    id: 'repairType',
                    path: 'closure',
                    stringId: 'report.closureRemarks',
                    name: 'Repair Type',
                    fun: (type) => {
                        return type?.remarks
                    }
                },
                {
                    id: 'age',
                    name: 'Age',
                    fun: (obj, index, originalRecord) => {
                        let start = Moment(originalRecord.createdOn);
                        let end = Moment(originalRecord.completedOn);
                        let duration = Moment.duration(end.diff(start));
                        return duration.asHours() < 24 ? Math.round(duration.asHours()) + ' hours' : duration.asDays().toFixed(1) + ' days';
                    }
                },
                {
                    id: 'responseTime',
                    name: 'Response Time',
                    fun: (rt, index, originalRecord) => {
                        let start = Moment(originalRecord.createdOn);
                        let end = Moment(originalRecord.lastEvent ? originalRecord.lastEvent.when : originalRecord.completedOn);
                        let duration = Moment.duration(end.diff(start));
                        return duration.asHours() < 24 ? Math.round(duration.asHours()) + ' hours' : duration.asDays().toFixed(1) + ' days';
                    }
                }
            ]
        }
    }
}

module.exports = ticketReports;