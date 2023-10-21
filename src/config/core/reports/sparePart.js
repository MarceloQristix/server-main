const Moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(Moment);

const formatDateTime= function (val) {
    //dd/mm/yy hh:mm (24 hrs)
    return Moment(val).format('DD/MM/YY HH:MM');
}

const ticketsDef = {
     "partRequisitions":   {
            id: 'partRequisitions',
            name: 'Part Requisitions',
            description: 'Lists all spare-parts needed to close tickets',
            type: 'raw',
            data: {
                collection: 'PartRequisition',
                condition: {
                    status: {$nin: ['cancelled','fulfilled']}
                },
                projection: [
                    {
                        id: 'code',
                        name: 'Part Requisition'
                    },
                    {
                        id: 'TicketNo',
                        path: 'sourceTicket.code',
                        name: 'Ticket No'
                    },
                    {
                        path: 'asset.customer.name',
                        id: 'customerName',
                        name: 'Customer'
                    },
                    {
                        path: 'requester.name',
                        id: 'techName',
                        stringId: 'technician',
                        name: 'Engineer'
                    },
                    {
                        path: 'asset.name',
                        id: 'assetName',
                        name: 'Product and Model No'
                    },
                    {
                        id: 'holdReason',
                        name: 'Hold Reason'
                    },
                    {
                        id: 'status',
                        name: 'Status'
                    },
                    {
                        id: 'createdOn',
                        name: 'CreatedOn',
                        fun:(createdOn) => {
                            return formatDateTime(createdOn);
                        }
                    },
                    {
                        id: 'parts',
                        name: 'Spare-parts needed',
                    }
                ],
                unwind: {
                    id: "parts"
                },
                projection2: [
                    {
                        id: 'code',
                        name: 'Part Requisition'
                    },
                    {
                        id: 'TicketNo',
                        name: 'Ticket No'
                    },
                    {
                        id: 'customerName',
                        name: 'Customer'
                    },
                    {
                        id: 'techName',
                        stringId: 'technician',
                        name: 'Engineer'
                    },
                    {
                        id: 'assetName',
                        name: 'Product and Model No'
                    },
                    {
                        id: 'holdReason',
                        name: 'Hold Reason'
                    },
                    {
                        id: 'status',
                        name: 'Status'
                    },
                    {
                        id: 'createdOn',
                        name: 'CreatedOn',
                        fun:(createdOn) => {
                            return formatDateTime(createdOn);
                        }
                    },
                    {
                        id: 'name',
                        path: 'parts.name',
                        name: 'Part Name'
                    },
                    {
                        id: 'quantity',
                        path: 'parts.quantity',
                        name: 'Quantity Required'
                    }
                ]
            }
        },
     "spareParts":   {
            id: 'spareParts',
            name: 'Spare parts required',
            description: 'Lists all spare-parts needed to close tickets',
            type: 'raw',
            data: {
                collection: 'Ticket',
                condition: {
                    status: {$eq: '03_on_hold'}, 
                    holdReason:{$eq: '01_spares_not_available'}
                },
                projection: [
                    {
                        id: 'code',
                        name: 'TicketNo'
                    },
                    {
                        path: 'customer.name',
                        id: 'customerName',
                        name: 'Customer'
                    },
                    {
                        id: 'desc',
                        name: 'Description'
                    },
                    {
                        path: 'assignee.name',
                        id: 'techName',
                        stringId: 'technician',
                        name: 'Technician'
                    },
                    {
                        path: 'asset.name',
                        id: 'assetName',
                        name: 'Product and Model No'
                    },
                    {
                        id: 'createdOn',
                        name: 'CreatedOn',
                        fun:(createdOn) => {
                            return formatDateTime(createdOn);
                        }
                    },
                    {
                        id: 'sparesRequired',
                        name: 'Spare-parts needed',
                        collect: [
                            {
                                id: 'name',
                                from: 'name',
                                name: 'Part Name'
                            },
                            {
                                id: 'spareCode',
                                from: 'code',
                                name: 'Part Code'
                            },
                            {
                                id: 'listPrice',
                                from: 'listPrice',
                                name: 'List Price'
                            },
                            {
                                id: 'quantity',
                                from: 'quantity',
                                name: 'Quantity Required'
                            }
                        ]
                    }
                ]
            }
        },
     "consumables":   {
            id: 'consumables',
            name: 'Consumables required',
            description: 'Lists all consumables needed to close tickets',
            type: 'raw',
            data: {
                collection: 'Ticket',
                condition: {
                    status: {$eq: '03_on_hold'}, 
                    sType: {$eq: 'consumable_req'}
                },
                projection: [
                    {
                        id: 'code',
                        name: 'TicketNo'
                    },
                    {
                        path: 'customer.name',
                        id: 'customerName',
                        name: 'Customer'
                    },
                    {
                        id: 'desc',
                        name: 'Description'
                    },
                    {
                        path: 'assignee.name',
                        id: 'techName',
                        name: 'Technician'
                    },
                    {
                        path: 'asset.name',
                        id: 'assetName',
                        name: 'Product and Model No'
                    },
                    {
                        id: 'createdOn',
                        name: 'CreatedOn',
                        fun:(createdOn) => {
                            return formatDateTime(createdOn);
                        }
                    },
                    {
                        id: 'consumables',
                        name: 'Consumables needed',
                        collect: [
                            {
                                id: 'name',
                                from: 'name',
                                name: 'Consumable Name'
                            },
                            {
                                id: 'conCode',
                                from: 'code',
                                name: 'Consumable Code'
                            },
                            {
                                id: 'listPrice',
                                from: 'listPrice',
                                name: 'List Price'
                            },
                            {
                                id: 'quantity',
                                from:'quantity',
                                name: 'Quantity Required'
                            }
                        ]
                    }
                ]
            }
        },
     "sparePartsAndConsumables":   {
            id: 'sparePartsAndConsumables',
            name: 'Consumables And Spare-parts required',
            description: 'Lists all consumables and spare-parts needed to close tickets',
            type: 'raw',
            data: {
                collection: 'Ticket',
                condition: {
                    status: {$eq: '03_on_hold'}, 
                    $or: [
                        {holdReason: {$eq: '01_spares_not_available'}},
                        {sType: {$eq: 'consumable_req'}}
                    ]
                },
                projection: [
                    {
                        id: 'code',
                        name: 'TicketNo'
                    },
                    {
                        path: 'customer.name',
                        id: 'customerName',
                        name: 'Customer'
                    },
                    {
                        id: 'desc',
                        name: 'Description'
                    },
                    {
                        path: 'assignee.name',
                        id: 'techName',
                        name: 'Technician'
                    },
                    {
                        path: 'asset.name',
                        id: 'assetName',
                        name: 'Product and Model No'
                    },
                    {
                        id: 'createdOn',
                        name: 'CreatedOn',
                        fun:(createdOn) => {
                            return formatDateTime(createdOn);
                        }
                    },
                    {
                        id: 'consumables',
                        name: 'Consumables needed',
                        collect: [
                            {
                                id: 'conName',
                                from: 'name',
                                name: 'Consumable Name'
                            },
                            {
                                id: 'conCode',
                                from: 'code',
                                name: 'Consumable Code'
                            },
                            {
                                id: 'listPrice',
                                from: 'listPrice',
                                name: 'List Price'
                            },
                            {
                                id: 'quantity',
                                from:'quantity',
                                name: 'Quantity Required'
                            }
                        ]
                    },
                    {
                        id: 'sparesRequired',
                        name: 'Spare-parts needed',
                        collect: [
                            {
                                id: 'spareName',
                                from: 'name',
                                name: 'Part Name'
                            },
                            {
                                id: 'spareCode',
                                from: 'code',
                                name: 'Part Code'
                            },
                            {
                                id: 'spareListPrice',
                                from: 'listPrice',
                                name: 'List Price'
                            },
                            {
                                id: 'spareQuantity',
                                from:'quantity',
                                name: 'Quantity Required'
                            }
                        ]
                    }
                ]
            }
        }
}

module.exports = ticketsDef;