const Moment = require('moment');


const DashboardDef = ()=>{
    const today= Moment().startOf('day').toDate();
    const thisMonth= Moment().startOf('month').startOf('day').toDate();
    return {
        sections: [
        {
            id: 'businessOverview',
            name: 'Business Overview',
            blocks: [
                {
                    id: 'assetsTotal',
                    name: 'Equipments',
                    color:'#dc0ab4',
                    subColor: '#6b6a6a',
                    to: {
                        pathname: '/asset',
                        search: `filter=${JSON.stringify({ status: 'nonDraft' })}`,
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Asset',
                        condition: {
                            status: {$ne: '01_draft'},
                            isDeleted: {$ne: true}
                        }
                    },
                    items: [
                        {
                            id: 'assetsUnderWarranty',
                            name: 'Warranty',
                            color: '#ea5545',
                            to:{
                                pathname: '/asset',
                                search: `filter=${JSON.stringify({ status: 'underWarranty' })}`
                            },
                            target: 'asset',
                            filterId: 'underWarranty',
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Asset',
                                condition: {
                                    contract: {$exists: true},
                                    'contract.cType': 'warranty',
                                    isDeleted: {$ne: true}
                                }
                            }
                        },
                        {
                            id: 'assetsUnderContract',
                            name: 'Contract',
                            color: '#ea5545',
                            to:{
                                pathname: '/asset',
                                search: `filter=${JSON.stringify({ status: 'underContract' })}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Asset',
                                condition: {
                                    status: {$ne: '01_draft'},
                                    'contract.cType': {$ne:'warranty'},
                                    contract: {$exists: true},
                                    isDeleted: {$ne: true}
                                }
                            }
                        },
                        {
                            id: 'assetsUnderNoContract',
                            name: 'No Contract',
                            color: '#ea5545',
                            to:{
                                pathname: '/asset',
                                search: `filter=${JSON.stringify({ status: 'noContract' })}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Asset',
                                condition: {
                                    status: {$ne: '01_draft'},
                                    'contract.cType': {$ne:'warranty'},
                                    contract: {$exists: false},
                                    isDeleted: {$ne: true}
                                }
                            }
                        }
                    ]
                },
                {
                    id: 'customersTotal',
                    name: 'Customers',
                    color:'#e60049',
                    subColor: '#6b6a6a',
                    to:{
                        pathname: '/customer'
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Customer',
                        condition: {
                            isDeleted: {$ne: true}
                        }
                    },
                    items: [
                        {
                            id: 'activeCustomers',
                            name: 'Active',
                            color: '#dc0ab4',
                            to:{
                                pathname: '/customer',
                                search: `filter=${JSON.stringify({ status: 'active' })}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Customer',
                                condition: {
                                    isDeleted: {$ne: true},
                                    isActive: true
                                }
                            }
                        },
                        {
                            id: 'inactiveCustomers',
                            name: 'Inactive',
                            color: '#dc0ab4',
                            to:{
                                pathname: '/customer',
                                search: `filter=${JSON.stringify({ status: 'inactive' })}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Customer',
                                condition: {
                                    isDeleted: {$ne: true},
                                    isActive: {$ne: true}
                                }
                            }
                        },
                        {
                            id: 'customersAddedThisMonth',
                            name: '+ This Month',
                            color: '#dc0ab4',
                            to:{
                                pathname: '/customer',
                                search: `filter=${JSON.stringify({ created: 'thisMonth' })}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Customer',
                                condition: {
                                    createdOn: {$gte: thisMonth},
                                    isDeleted: {$ne: true},
                                }
                            }
                        }
                    ]
                },
                {
                    id: 'consumablesUsed',
                    name: 'Consumables Used (MTD)',
                    size: 6,
                    items: [
                        {
                            id: 'consumablesUsedUnderContract',
                            name: 'Under Contract',
                            color: '#ede15b',
                            data: {
                                type: 'number',
                                op: 'findOne',
                                collection: 'TktStats',
                                condition: {
                                    // use startDate, endDate filter with dynamic values
                                },
                                projectionKey:'stats.consumablesCostUnderContract'
                            }
                        },
                        {
                            id: 'consumablesUsedOutOfContract',
                            name: 'Out of Contract',
                            color: '#ede15b',
                            data: {
                                type: 'number',
                                op: 'findOne',
                                collection: 'TktStats',
                                condition: {
                                    // use startDate, endDate filter with dynamic values
                                },
                                projectionKey: 'stats.consumablesCostOutOfContract'
                            }
                        }
                    ]
                },
                {
                    id: 'sparesUsed',
                    name: 'Spares Used (MTD)',
                    size: 6,
                    items: [
                        {
                            id: 'sparesUsedUnderWarranty',
                            name: 'Under Warranty',
                            color: '#bdcf32',
                            data: {
                                type: 'number',
                                op: 'findOne',
                                collection: 'TktStats',
                                condition: {
                                    // use startDate, endDate filter with dynamic values
                                },
                                projectionKey: 'stats.sparesCostUnderWarranty'
                            }
                        },
                        {
                            id: 'sparesUsedUnderContract',
                            name: 'Under Contract',
                            color: '#bdcf32',
                            data: {
                                type: 'number',
                                op: 'findOne',
                                collection: 'TktStats',
                                condition: {
                                    // use startDate, endDate filter with dynamic values
                                },
                                projectionKey: 'stats.sparesCostUnderContract'
                            }
                        },
                        {
                            id: 'sparesUsedOutOfContract',
                            name: 'Out of Contract',
                            color: '#bdcf32',
                            data: {
                                type: 'number',
                                op: 'findOne',
                                collection: 'TktStats',
                                condition: {
                                    // use startDate, endDate filter with dynamic values
                                },
                                projectionKey: 'stats.sparesCostOutOfContract'
                            }
                        }
                    ]
                },
                {
                    id: 'top5CustomersByRevenue',
                    name: 'Top 5 Customers By Revenue',
                    valueLabel: 'Revenue',
                    color: '#143d59',
                    valueColor: '#007bff',
                    valueType: 'money',
                    data: {
                        type: 'list',
                        op: 'find',
                        collection: 'Customer',
                        condition: {
                        },
                        options: {
                            sort: {
                                'stats.revenue': -1
                            },
                            limit: 5
                        },
                        projection: {
                            _id:1,
                            name: 1,
                            code: 1,
                            'stats.revenue':1
                        }
                    }
                },
                {
                    id: 'top5CustomersByTickets',
                    name: 'Top 5 Customers By Tickets',
                    valueLabel: '# Tickets',
                    color: '#143d59',
                    valueColor: '#007bff',
                    data: {
                        type: 'list',
                        op: 'find',
                        collection: 'Ticket',
                        condition: {
                        },
                        options: {
                            sort: {
                                'stats.numTickets': -1
                            },
                            limit: 5
                        },
                        projection: {
                            _id:1,
                            name: 1,
                            code: 1,
                            'stats.numTickets':1
                        }
                    }
                }
            ]
        },
        {
            id: 'getThingsDone',
            name: 'Get Things Done',
            blocks: [
                {
                    id: 'totalTicketsCreatedToday',
                    name: 'Tickets Created Today',
                    color:'#b33dc6',
                    subColor: '#6b6a6a',
                    to: {
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({ created: 'today' })}`
                    },
                    data: {
                        type: 'number',
                        op:'count',
                        collection: 'Ticket',
                        map: {
                            totalTicketsCreatedToday: 'created.total',
                            installationTicketsCreatedToday: 'created.installation',
                            supportTicketsCreatedToday: 'created.support',
                            consumableTicketsCreatedToday: 'created.consumable_req',
                        },
                        condition: {
                            sType: {$ne:'pm'},
                            createdOn: {$gte: today}
                        }
                    },
                    items: [
                        {
                            id: 'installationTicketsCreatedToday',
                            name: 'Installation',
                            color: '#f46a9b',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({crated:'today', sType: 'installation' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    sType: 'installation',
                                    createdOn: {$gte: today}
                                },
                            }
                        },
                        {
                            id: 'supportTicketsCreatedToday',
                            name: 'Breakdown',
                            color: '#f46a9b',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ created: 'today', sType: 'support' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    sType: 'support',
                                    createdOn: {$gte: today}
                                },
                            }
                        },
                        {
                            id: 'consumableTicketsCreatedToday',
                            name: 'Consumable Requests',
                            color: '#f46a9b',
                            size: 6,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ created:'today', sType: 'consumable_req' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    sType: 'consumable_req',
                                    createdOn: {$gte: today}
                                },
                            }
                        }
                    ]
                },
                {
                    id: 'totalTicketsClosedToday',
                    name: 'Tickets Closed Today',
                    color:'#e60049',
                    subColor: '#6b6a6a',
                    to: {
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({ closed:'today'})}`,
                    },
                    data: {
                        type: 'number',
                        op:'count',
                        collection: 'Ticket',
                        condition: {
                            status: '05_closed',
                            completedOn: {$gte: today}
                        },
                    },
                    items: [
                        {
                            id: 'installationTicketsClosedToday',
                            name: 'Installation',
                            color: '#ffa300',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ closed:'today', sType: 'installation' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    sType: 'installation',
                                    status: '05_closed',
                                    completedOn: {$gte: today}
                                },
                            }
                        },
                        {
                            id: 'supportTicketsClosedToday',
                            name: 'Breakdown',
                            color: '#ffa300',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `displayFilters=${JSON.stringify({closed:true})}&filter=${JSON.stringify({ closed:'today', sType: 'support' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    sType: 'support',
                                    status: '05_closed',
                                    completedOn: {$gte: today}
                                },
                            }
                        },
                        {
                            id: 'consumableRequestsClosedToday',
                            name: 'Consumables',
                            color: '#ffa300',
                            size: 4,
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    sType: 'consumable_req',
                                    status: '05_closed',
                                    completedOn: {$gte: today}
                                },
                            }
                        },
                        {
                            id: 'pmClosedToday',
                            name: 'PM',
                            color: '#ffa300',
                            size: 2,
                            data: {
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    sType: 'pm',
                                    status: '05_closed',
                                    completedOn: {$gte: today}
                                },
                            }
                        }
                    ]
                },
                {
                    id: 'totalUnresolvedTickets',
                    name: 'Unresolved Tickets',
                    color:'#02854F',
                    subColor: '#6b6a6a',
                    size: 4,
                    to:{
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({ status: 'notClosed'})}`
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Ticket',
                        condition: {
                            status: 'notClosed'
                        }
                    },
                    items: [
                        {
                            id: 'pendingUnresolved',
                            name: 'Pending',
                            color: '#00bfa0',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ assignee: 'exists', status: 'notClosed'})}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Ticket',
                                condition: {
                                    status: 'notClosed',
                                    assignee: 'exists'
                                }
                            }
                        },
                        {
                            id: 'unAssignedUnresolved',
                            name: 'Unassigned',
                            color: '#00bfa0',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ assignee: 'none', status:'notClosed'})}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Ticket',
                                condition: {
                                    status: 'notClosed',
                                    assignee: 'none'
                                }
                            }
                        }
                    ]
                },
                {
                    id: 'assignedTickets',
                    name: 'Assigned Tickets',
                    color:'#ffa300',
                    subColor: '#6b6a6a',
                    to:{
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({ status: 'notClosed', assignee: 'exists'})}`
                    },
                    size: 4,
                    data: {
                        type: 'number',
                        op:'count',
                        collection: 'Ticket',
                        condition: {
                            status: 'notClosed',
                            assignee: 'exists'
                        },
                    },
                    items: [
                        {
                            id: 'assignedYet2Start',
                            name: 'Yet to Start',
                            color: '#e6d800',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ status: '01_open', assignee:'exists'})}`
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    status: '01_open',
                                    assignee: 'exists'
                                }
                            }
                        },
                        {
                            id: 'assignedInProgress',
                            name: 'In Progress',
                            color: '#e6d800',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ status: '03_on_hold', assignee:'exists'})}`
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    status: '03_on_hold',
                                    assignee: 'exists'
                                }
                            }
                        }
                    ]
                },
                {
                    id: 'totalPendingTickets',
                    name: 'All Pending Tickets',
                    color:'#0bb4ff',
                    subColor: '#6b6a6a',
                    to:{
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({ status: '03_on_hold'})}`
                    },
                    size: 4,
                    data: {
                        type: 'number',
                        op:'count',
                        collection: 'Ticket',
                        condition: {
                            status: '03_on_hold'
                        },
                    },
                    items: [
                        {
                            id: 'pendingForSpares',
                            name: 'Spares',
                            color: '#50e991',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ status: '03_on_hold', holdReason:'01_spares_not_available'})}`
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    status: '03_on_hold',
                                    holdReason:'01_spares_not_available'
                                }
                            }
                        },
                        {
                            id: 'pendingForConsumables',
                            name: 'Consumables',
                            color: '#50e991',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ status: '03_on_hold', holdReason:'01_spares_not_available'})}`
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    status: '03_on_hold',
                                    sType: 'consumable_req'    //FIXME
                                }
                            }
                        }
                    ]
                },
                {
                    id: 'pmTicketsDueInNext7Days',
                    name: 'PM Tickets Scheduled',
                    definition: '(for next 7 days)',
                    size: 4,
                    color: '#e60049',
                    labelColor: 'black',
                    icon: "tool",
                    to:{
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({sType: 'pm', status: 'notClosed', dueDate: 'next7days'})}`
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Ticket',
                        condition: {
                            sType: 'pm',
                            status: 'notClosed',
                            dueDate: 'next7days'
                        }
                    }
                },
                {
                    id: 'totalTATExceededUnresolvedTickets',
                    name: 'TAT Exceeded Tickets',
                    definition: '(Turn-Around-Time exceeded)',
                    color: '#e60049',
                    labelColor: 'black',
                    size: 4,
                    icon: "alert-octagon",
                    to:{
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({ status: 'tatExceeded'})}`
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Ticket',
                        condition: {
                            status: {$ne:'05_closed'},
                           // isTATExceeded: true, //FIXME : this value is not getting populated
                            createdOn: {$lte: Moment().subtract(2, 'days').toDate()}
                        },
                        options: {
                            sort: {endDate: -1} //Post adding filter remove this sort
                        }
                    }
                },
                {
                    id: 'totalContractsExpiringNext15Days',
                    name: 'Contracts Expiring',
                    definition: '(in Next 15 days)',
                    size: 4,
                    color: '#e60049',
                    labelColor: 'black',
                    icon: "package",
                    to:{
                        pathname: '/contract',
                        search: `filter=${JSON.stringify({ cType:'nonWarranty', expiry: 'next15Days'})}`
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Contract',
                        condition: {
                            status: '03_active',
                            cType: {$ne: 'warranty'},
                            endDate : {$lte: Moment().add(15,'days').toDate()}
                        }
                    },
                },
                {
                    id: 'totalWarrantyExpiringNext15Days',
                    name: 'Warranty Expiring',
                    definition: '(in Next 15 days)',
                    size: 4,
                    color: '#e60049',
                    labelColor: 'black',
                    icon: "check",
                    to:{
                        pathname: '/contract',
                        search: `filter=${JSON.stringify({ cType:'warranty', expiry: 'next15Days'})}`
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Contract',
                        condition: {
                            status: '03_active',
                            cType: 'warranty',
                            endDate : {$lte: Moment().add(15,'days').toDate()}
                        }
                    },
                },
                {
                    id: 'paymentPendingTickets',
                    name: 'Payment Pending',
                    definition: '(from customers)',
                    size: 4,
                    color: '#e60049',
                    labelColor: 'black',
                    icon: "dollar-sign",
                    to:{
                        pathname: '/ticket',
                        search: `filter=${JSON.stringify({status: 'paymentPending'})}`
                    },
                    data: {
                        type: 'number',
                        op: 'count',
                        collection: 'Ticket',
                        condition: {
                            status: 'paymentPending'
                        }
                    }
                }
            ]
        }
    ]
    }
};

//TODO: Add validations for uniqueness of id

module.exports = DashboardDef;
