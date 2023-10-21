const Moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(Moment);

const formatDateTime= function (val) {
    //dd/mm/yy hh:mm (24 hrs)
    return val? Moment(val).format('DD/MM/YY HH:MM'): '--';
}
const formatDateOnly= function (val) {
    return val? Moment(val).format('DD/MM/YY'): '--';
}

const formatAddress= function (val){
    if (!val){
        return '--';
    }
    let nonEmptyAddrFieldValues= [];
    let fields= ['addrLine1', 'addrLine2', 'city', 'state', 'pinCode'];
    for (let addrField of fields) {
        if (val[addrField]){
            nonEmptyAddrFieldValues.push(val[addrField]);
        }
    }
    return nonEmptyAddrFieldValues.join(',');
}

const ticketTypes = {
    'breakdown': 'Breakdown',
    'pm': 'Preventive Maintenance',
    'pd': 'Periodic Maintenance',
    'installation': 'Installation',
    'inspection': 'Inspection',
    'consumable_req': 'Consumables Request',
    'support': 'Support Request'
};

const assetReports = {
    "mif": {
            id: 'mif',
            name: 'All Assets or Equipments (MIF - Machines In Field)',
            description: 'List of all assets/equipments',
            type: 'raw',
            data: {
                collection: 'Asset',
                fieldNamespace: 'asset',
                condition: {
                    status: { $ne: '01_draft' },
                },
                projection: [
                    {
                        fieldIdPath: 'asset.primaryIdentifier',
                        id:'code',
                        name: 'Asset Number',
                        width: 20,
                    },
                    {
                        id:'assetSerialNumber',
                        path: 'serialNumber',
                        name:'Serial Number',
                        stringId: 'asset.fields.serialNumber',
                    },
                    {
                        id:'secondarySerialNumber',
                        path: 'secondarySerialNumber',
                        stringId: 'asset.fields.secondarySerialNumber',
                        name:'Code 1'
                    },
                    {
                        id:'extraCode1',
                        path: 'extraCode1',
                        name:'Code 2',
                        stringId: 'asset.fields.extraCode1',
                    },
                    {
                        id:'assetDesc',
                        path: 'name',
                        name:'Description'
                    },
                    {
                        id:'productName',
                        path: 'model.product.name',
                        stringId: 'report.productName',
                        name:'ASSET DESCRIPTION',
                        fun2: function (value){
                            return value? value.split('/')[0]: value;
                        }
                    },
                    {
                        'featureFlag': 'asset.criticalClassification',
                        id: 'isCritical',
                        name:'CRITICAL?',
                        fun: function (value){
                            return value? 'C': 'N/C';
                        }
                    },
                    {
                        path: 'model.product.manufacturer',
                        id: 'manufacturer',
                        name:'Manufacturer',
                        fun2: function (value, rowIndex, record){
                            return value? value: (record.productName? record.productName.split('/')[1]||'': '');
                        },
                    },
                    {
                        path: 'model.name',
                        id:'modelName',
                        name:'Model'
                    },
                    {
                        id:'customerName',
                        path: 'customer.name',
                        name:'Customer'
                    },
                    {
                        id:'customerPhone',
                        path: 'contact.phoneNumber',
                        name:'Customer Phone'
                    },
                    {
                        id:'customerEmail',
                        path: 'contact.email',
                        name:'Customer Email'
                    },
                    {
                        id:'contactName',
                        path: 'contact.name',
                        name:'Contact Person Name'
                    },
                    {
                        id: 'address',
                        name: 'Location',
                        fun: formatAddress
                    },
                    {
                        id:'locatedAt',
                        name:'Located At'
                    },
                    {
                        id: 'installedOn',
                        name: 'Installation Date',
                        fun: formatDateOnly,
                        fun2: formatDateTime
                    },
                    {
                        id: 'technicianName',
                        path:"technician.name",
                        name: 'Technician',
                        stringId: 'technician'
                    },
                    {
                        id: 'contractCode',
                        path: 'contract.code',
                        name: 'Contract Code'
                    },
                    {
                        id:'contractType',
                        path: 'contract.cType',
                        name:'Contract Type'
                    },
                    {
                        id:'contractReferenceNumber',
                        path: 'contract.referenceNumber',
                        name:'Contract ReferenceNumber'
                    },
                    {
                        id: 'contractName',
                        path: 'contract.name',
                        name: 'Contract Name'
                    },
                    {
                        id:'contractStartDate',
                        path: 'contract.startDate',
                        name: 'Contract Start Date',
                        fun: formatDateOnly,
                        fun2: formatDateTime
                    },
                    {
                        id:'contractEndDate',
                        path: 'contract.endDate',
                        name: 'Contract End Date',
                        fun: formatDateOnly,
                        fun2: formatDateTime
                    }
                ]
            }
        },
    "pm":  {
            id: 'pm',
            name: 'Preventive Maintenance Schedule',
            description: 'Lists Preventive Maintenance Schedule for all Assets / Equipments',
            filters: {
                dateRange: {
                    startDate: {},
                    endDate: {}
                }
            },
            type: 'raw',
            data: {
                collection: 'Ticket',
                fieldNamespace: 'Maintenance',
                condition: {
                    status: {$ne: '05_closed'},
                    sType: {$eq: 'pm'},
                    dueDate: {$gte: '{{startDate}}', $lte:'{{endDate}}'}
                },
                projection: [
                    {
                        id:'dueDate',
                        name: 'Scheduled On',
                        fun:(dueDate) => {
                            return formatDateTime(dueDate);
                        }
                    },
                    {
                        fieldIdPath: 'maintainence.primaryIdentifier',
                        id:'code',
                        name: 'Maintainence ID',
                        width: 20,
                    },
                    {
                        id: 'sType',
                        name: 'Ticket Type',
                        fun: (type) => {
                            return ticketTypes[type];
                        }
                    },
                    {
                        id: 'customerName',
                        path: 'customer.name',
                        name: 'Customer'
                    },
                    {
                        id: 'techName',
                        path: 'assignee.name',
                        name: 'Technician'
                    },
                    {
                        id: 'assetName',
                        path: 'asset.name',
                        name: 'Asset'
                    },
                    {
                        id: 'model',
                        path: 'asset.model.name',
                        name: 'Product Model'
                    },
                    {
                        id: 'assetSite',
                        path: 'asset.site',
                        name: 'Branch'
                    },
                    {
                        id: 'assetLocatedAt',
                        path: 'asset.locatedAt',
                        name: 'Located At'
                    },
                    {
                        id: 'contractName',
                        path: 'asset.contract',
                        name:'Contract Name',
                        fun:(contract) => {
                            return contract?.name
                        }
                    },
                    {
                        id: 'contractCode',
                        path: 'asset.contract',
                        name:'Contract Code',
                        fun:(contract) => {
                            return contract?.code
                        }
                    }
                ]
            }
        },
    "complaints": {
            id: 'complaints',
            name: 'Assets complaints',
            description: 'List of all tickets that were created & updated in the selected data range',
            type: 'raw',
            filters: {
                dateRange: {
                    startDate: {},
                    endDate: {}
                }
            },
            data: {
                collection: 'Ticket',
                fieldNamespace: 'ticket',
                condition: {
                    sType: {$in: ['support','breakdown']},
                    'lastModifiedOn': {$gte: '{{startDate}}', $lte:'{{endDate}}'}
                },
                projection: [
                    {
                        id:'assetSerialNumber',
                        path: 'asset.serialNumber',
                        name:'Serial Number'
                    },
                    {
                        id:'assetCode',
                        path: 'asset.secondaryCode',
                        width: 20,
                        name:'ASSET NUMBER'
                    },
                    {
                        id:'productName',
                        path: 'asset.model.product.name',
                        name:'ASSET DESCRIPTION',
                        stringId: 'report.productName',
                        fun2: function (value){
                            return value? value.split('/')[0]: value;
                        }
                    },
                    {
                        id: 'manufacturer',
                        path: 'asset.model.product.manufacturer',
                        name:'manufacturer',
                        fun2: function (value, rowIndex, record){
                            return value? value: (record.productName? record.productName.split('/')[1]||'': '');
                        }
                    },
                    {
                        id:'modelName',
                        path: 'asset.model.name',
                        name:'Model'
                    },
                    {
                        id: 'createdOn',
                        name: ' CALL RECEIVED DT & TIME dd/mm/yy hh:mm (24 hrs)',
                        fun: formatDateTime
                    },
                    {
                        id:'workStartedOn',
                        path: 'createdOn',
                        name: ' CALL ATTENDED DT & TIME dd/mm/yy hh:mm (24 hrs)',
                        fun: formatDateTime
                    },
                    {
                        path: 'asset.locatedAt',
                        id:'assetLocatedAt',
                        name: 'Department'
                    },
                    {
                        id:'completedOn',
                        name: 'CALL CLOSED DT & TIME  dd/mm/yy hh:mm (24 hrs)',
                        fun: formatDateTime
                    },
                    {
                        id:'_downtime',
                        name: 'DOWN TIME IN HRs',
                        fun: function (value, rowIndex, record){
                            return Moment.duration((new Date(record.completedOn)).valueOf() - (new Date(record.createdOn)).valueOf() ).format('h:mm', {trim:false});
                        }
                    },
                    {
                        fieldId: 'servicedByType',
                        name: 'ATTENDED BY INHOUSE/ VENDOR/ OEM',
                        fun: function (value){
                            return value ==='self'? 'INHOUSE': (value||'').toUpperCase();
                        }
                    },
                    {
                        id: 'name',
                        name: 'NATURE OF COMPLAINT'
                    },
                    {
                        id: 'code',
                        name: 'TicketNo'
                    },
                    {
                        id: 'status',
                        name: 'Status',
                        fun: function (value){
                            return (value === '05_closed'|| value=== '06_cancelled') ?'CLOSE': 'OPEN';
                        }
                    },
                    {
                        id:'jobDone',
                        path:'closure.jobDone',
                        name:'Action Taken'
                    },
                    {
                        id:'',
                        name:'Action Taken'
                    },
                    {
                        id:'closureRemarks',
                        path:'closure.remarks',
                        name:'Remarks'
                    },
                    // {
                    //     id: 'asset.name',
                    //     name: 'Product and Model No'
                    // },
                    // {
                    //     id: 'sType',
                    //     name: 'Type'
                    // },
                    {
                        id: 'customerName',
                        path:'customer.name',
                        name: 'Customer'
                    },
                    // {
                    //     id: 'desc',
                    //     name: 'Description'
                    // },
                    // {
                    //     id: 'assignee.name',
                    //     name: 'Technician'
                    // },
                ]
            }
        }
};

module.exports = assetReports;