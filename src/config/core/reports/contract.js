const Moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(Moment);
const dateAfter30 = Moment().add(30, 'day').toDate();

const formatDateTime= function (val) {
    //dd/mm/yy hh:mm (24 hrs)
    return Moment(val).format('DD/MM/YY HH:MM');
}

const formatAssetCode= function (val){
    let assets= val;
    if (!assets || (assets.length === 0)){
        return '--';
    }
    if (assets.length === 1){
        return assets[0].serialNumber;
    }
    else {
        return 'multiple';
    }
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

const contractStatus = {
    "01_draft": "Draft",
    "03_active": "Active",
    "04_expired": "Expired",
    "05_cancelled": "Cancelled"
}

const contractsDef = {
   "allContracts":     {
            id: 'allContracts',
            name: 'All Contracts',
            description: 'Lists all contracts created in a specific period',
            type: 'raw',
            data: {
                collection: 'Contract',
                condition: {
                    status: {$eq: '03_active'},
                },
                projection: [
                    {
                        id: 'code',
                        name: 'Contract No'
                    },
                    {
                        id: 'referenceNumber',
                        name: 'Contract Ref'
                    },
                    {
                        id: 'status',
                        name: 'Status',
                        fun: (status) => {
                            return contractStatus[status];
                        }
                    },
                    {
                        id: 'name',
                        name: 'Contract Name'
                    },
                    {
                        id: 'expiryType',
                        name: 'Expiry Type'
                    },
                    {
                        id: 'startDate',
                        name: 'Start Date',
                        fun:(startDate) => {
                            return formatDateTime(startDate);
                        }
                    },
                    {
                        id: 'endDate',
                        name: 'Expiry Date',
                        fun:(endDate) => {
                            return formatDateTime(endDate);
                        }
                    },
                    {
                        id: 'numAssets',
                        name: 'No of Products'
                    },
                    {
                        id: 'product',
                        path: 'product.name',
                        name: 'Product Name'
                    },
                    {
                        id: 'model',
                        path: 'model.name',
                        name: 'Model'
                    },
                    {
                        id: 'asset',
                        path: 'assets',
                        name: 'Asset ID',
                        fun: formatAssetCode
                    },
                    {
                        id: 'customer',
                        path: 'customer.name',
                        name: 'Customer'
                    },
                    {
                        id: 'address',
                        path:'customer.address',
                        name: 'Location',
                        fun: formatAddress
                    },
                    {
                        id:'locatedAt',
                        name:'Located At'
                    },

                ]
            }
        },
   "expiringContracts":     {
            id: 'expiringContracts',
            name: 'Contracts that expire in 30 days',
            description: 'Lists all contracts expire in the next 30 days',
            type: 'raw',
            data: {
                collection: 'Contract',
                condition: {
                    endDate: {$lte : dateAfter30, $gte: new Date()}
                },
                projection: [
                    {
                        id: 'code',
                        name: 'Contract No'
                    },
                    {
                        id: 'referenceNumber',
                        name: 'Contract Ref'
                    },
                    {
                        id: 'status',
                        name: 'Status',
                        fun: (status) => {
                            return contractStatus[status];
                        }
                    },
                    {
                        id: 'name',
                        name: 'Contract Name'
                    },
                    {
                        id: 'expiryType',
                        name: 'Expiry Type'
                    },
                    {
                        id: 'startDate',
                        name: 'Start Date',
                        fun:(startDate) => {
                            return formatDateTime(startDate);
                        }
                    },
                    {
                        id: 'endDate',
                        name: 'Expiry Date',
                        fun:(endDate) => {
                            return formatDateTime(endDate);
                        }
                    },
                    {
                        id: 'numAssets',
                        name: 'No of Products'
                    },
                    {
                        id: 'product',
                        path: 'product.name',
                        name: 'Product Name'
                    },
                    {
                        id: 'model',
                        path: 'model.name',
                        name: 'Model'
                    },
                    {
                        id: 'asset',
                        path: 'assets',
                        name: 'Asset ID',
                        fun: formatAssetCode
                    },
                    {
                        id: 'customer',
                        path: 'customer.name',
                        name: 'Customer'
                    },
                    {
                        id: 'branch',
                        path:'product.locatedAt',
                        name: 'Branch'
                    }
                ]
            }
        },
   "expiredContracts":     {
            id: 'expiredContracts',
            name: 'Expired Contracts',
            description: 'Lists all contracts that have expired',
            type: 'raw',
            data: {
                collection: 'Contract',
                condition: {
                    status: {$eq : '04_expired'}
                },
                projection: [
                    {
                        id: 'code',
                        name: 'Contract No'
                    },
                    {
                        id: 'referenceNumber',
                        name: 'Contract Ref'
                    },
                    {
                        id: 'status',
                        name: 'Status',
                        fun: (status) => {
                            return contractStatus[status];
                        }
                    },
                    {
                        id: 'name',
                        name: 'Contract Name'
                    },
                    {
                        id: 'expiryType',
                        name: 'Expiry Type'
                    },
                    {
                        id: 'startDate',
                        name: 'Start Date',
                        fun:(startDate) => {
                            return formatDateTime(startDate);
                        }
                    },
                    {
                        id: 'endDate',
                        name: 'Expiry Date',
                        fun:(endDate) => {
                            return formatDateTime(endDate);
                        }
                    },
                    {
                        id: 'numAssets',
                        name: 'No of Products'
                    },
                    {
                        id: 'product',
                        path: 'product.name',
                        name: 'Product Name'
                    },
                    {
                        id: 'model',
                        path: 'model.name',
                        name: 'Model'
                    },
                    {
                        id: 'asset',
                        path: 'assets',
                        name: 'Asset ID',
                        fun: formatAssetCode
                    },
                    {
                        id: 'customer',
                        path: 'customer.name',
                        name: 'Customer'
                    }
                ]
            }
        }
}

module.exports = contractsDef;