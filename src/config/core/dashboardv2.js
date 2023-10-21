const Moment = require('moment');

const DashboardDef = (app, sectionId)=>{
    const DateTime = app.locals.services.DateTime;
    const today= DateTime.getMoment().startOf('day').toDate();
    const thisMonth= DateTime.getMoment().startOf('month').startOf('day').toDate();
    const sectionDef= {
        'businessOverview': {
            id: 'businessOverview',
            name: 'Business Overview',
            "groups": [
                {
                    "size": "col-8",
                    "blocks":[
                        "assetTotal",
                    ]
                },

            ],
            blocks: [
                {
                    id: 'assetsTotal',
                    name: 'No of Equipments under Management',
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
                            name: 'Under Warranty',
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
                            name: 'Under Contract',
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
                    name: 'No of Customers',
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
                            name: 'Added This Month',
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
                }
            ]
        },
        'getThingsDone': {
            id: 'getThingsDone',
            name: 'Get Things Done',
            "groups": [
                {
                    "size": "col-8",
                    "blocks":[
                        "ticketsRegisteredToday",
                    ]
                },
                {
                    "size": "col-8",
                    "blocks":[
                        "assetTotal",
                    ]
                }

            ],
            blocks: [
                {
                    id: 'ticketsRegistered',
                    name: 'Tickets Registered',
                    color:'#b33dc6',
                    subColor: '#6b6a6a',
                    items: [
                        {
                            id: 'ticketsRegisteredToday',
                            name: 'Today',
                            color: '#f46a9b',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({crated:'today' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    createdOn: {$gte: today}
                                },
                            }
                        },
                        {
                            id: 'ticketsRegisteredMTD',
                            name: 'MTD',
                            color: '#f46a9b',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({crated:'today' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    createdOn: {$gte: thisMonth}
                                },
                            }
                        }
                    ]
                },
                {
                    id: 'closedTickets',
                    name: 'Closed Tickets',
                    color:'#e60049',
                    subColor: '#6b6a6a',
                    items: [
                        {
                            id: 'closedTicketsToday',
                            name: 'Today',
                            color: '#ffa300',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ closed:'today' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    status: '05_closed',
                                    completedOn: {$gte: today}
                                },
                            }
                        },
                        {
                            id: 'closedTicketsMTD',
                            name: 'MTD',
                            color: '#ffa300',
                            size: 3,
                            to: {
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ closed:'thisMonth' })}`,
                            },
                            data: {
                                type: 'number',
                                op:'count',
                                collection: 'Ticket',
                                condition: {
                                    status: '05_closed',
                                    completedOn: {$gte: thisMonth}
                                },
                            }
                        }
                    ]
                },
                {
                    id: 'unresolvedTickets',
                    name: 'Unresolved Tickets',
                    color:'#02854F',
                    subColor: '#6b6a6a',
                    size: 4,
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
                    size: 4,
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
                            name: 'WiP',
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
                                    status: {$in: ['03_on_hold', '02_in_progress', '04_resolved']},
                                    assignee: 'exists'
                                }
                            }
                        }
                    ]
                },
                {
                    id: 'unresolvedTickets',
                    name: 'Open Tickets',
                    color:'#02854F',
                    subColor: '#6b6a6a',
                    size: 4,
                    "type": "vertical",
                    items: [
                        {
                            id: 'unresolvedSupport',
                            name: 'Breakdown',
                            color: '#00bfa0',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ sType: 'support', status: 'notClosed'})}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Ticket',
                                condition: {
                                    status: 'notClosed',
                                    sType: 'support'
                                }
                            }
                        },
                        {
                            id: 'unresolvedInstallation',
                            name: 'Installation',
                            color: '#00bfa0',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ sType: 'installation', status: 'notClosed'})}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Ticket',
                                condition: {
                                    status: 'notClosed',
                                    sType: 'installation'
                                }
                            }
                        },
                        {
                            id: 'unresolvedPM',
                            name: 'Preventive Maintenance',
                            color: '#00bfa0',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ sType: 'pm', status: 'notClosed'})}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Ticket',
                                condition: {
                                    status: 'notClosed',
                                    sType: 'pm'
                                }
                            }
                        },
                        {
                            id: 'unresolvedConsumableReq',
                            name: 'Supplies',
                            color: '#00bfa0',
                            to:{
                                pathname: '/ticket',
                                search: `filter=${JSON.stringify({ sType: 'consumable_req', status: 'notClosed'})}`
                            },
                            data: {
                                type: 'number',
                                op: 'count',
                                collection: 'Ticket',
                                condition: {
                                    status: 'notClosed',
                                    sType: 'consumable_req'
                                }
                            }
                        },
                    ]
                }
            ]
        },
        'needsAttention': {
            "id": "needsAttention",
            "name": "Needs Attention",
            "blocks":[
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
    }

    return sectionDef[sectionId];
};

//TODO: Add validations for uniqueness of id

module.exports = DashboardDef;
