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
    "ttkCustomTicketReport": {
        id: 'ttkCustomTicketReport',
        name: 'Ticket Report',
        description: 'Lists all tickets/work-orders that have been created/closed as of now',
        type: 'raw',
        data: {
            collection: 'Ticket',
            filters: {
                dateRange: {
                    startDate: {},
                    endDate: {}
                }
            },
            condition: {
                sType: {$ne: 'pm'},
                // createdOn: {$gte: '{{startDate}}', $lte: '{{endDate}}'}
            },
            projection: [
                {
                    "id": "site.custom.zone",
                    "name": "Zone"
                },
                {
                    "id": "address.area",
                    "name": "Town"
                },
                {
                    "id": "site.secondaryCode",
                    "name": "Dealer Code"
                },
                {
                    "id": "site.name",
                    "name": "Dealer Name"
                },
                {
                    "id": "address.pinCode",
                    "name": "Cluster Code ( 6 Digit code )"
                },
                {
                    "id": "cluster.name",
                    "name": "Area Status"
                },
                {
                    "id": "orgUnit.name",
                    "name": "Branch"
                },
                {
                    "id": "site.custom.region",
                    "name": "Region"
                },
                {
                    id: 'code',
                    name: 'Requisition Number'
                },
                {
                    "id": "skuModel"
                },
                {
                    "id": "sku.name",
                    "name": "Product / Model",
                    fun: (value, rowIndex, origRecord)=>{
                        return [value, origRecord.skuModel].join(' ');
                    }
                },
                {
                    "id": "name",
                    "name": "Nature Of Complaint"
                },
                {
                    "id": "assetOwnerType",
                    "name": "Dealer Stock / Customer Stock",
                    fun: (value)=>{
                        return value === 'trader'? 'Dealer Stock': 'Customer Stock'
                    }
                },
                {
                    "id": "skuQuantity",
                    "name": "Qty"
                },
                {
                    id: 'status',
                    name: 'Status ( Closed / Open )',
                    fun: (value) => ticketStatus[value]
                },
                {
                    id: 'createdOn',
                    name: 'Requisition Created Date',
                    fun: (createdOn) => {
                        return formatDateTime(createdOn);
                    }
                },
                {
                    id: 'desc',
                    name: 'Description'
                },
                {
                    id: 'completedOn',
                    name: 'Requisition Closed Date',
                    fun: (completedOn) => {
                        return formatDateTime(completedOn);
                    }
                }
            ]
        }
    }
}

module.exports = ticketReports;