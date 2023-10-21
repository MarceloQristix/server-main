/**
 * @desc Contains Ticket Schema
 */
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Utils = require('../utils');
const {number} = require("joi");
const AddressSchema = Utils.AddressSchema;
const ContactSchema = Utils.ContactSchema;
const CollSchemaShort= Utils.CollSchemaShort;
const EventLogSchema= require('./EventLog').schema();

const TICKET_STATUS = {
    OPEN        : '01_open',
    IN_PROGRESS : '02_in_progress', //work in progress
    ON_HOLD     : '03_on_hold',
    RESOLVED    : '04_resolved',
    CLOSED      : '05_closed',
    CANCELLED   : '06_cancelled'
};

const STYPE = {
    SUPPORT         : 'support',    //breakdown
    PM              : 'pm',
    INSTALLATION    : 'installation',
    INSPECTION      : 'inspection',
    COMMISSIONING   : 'commissioning',
    CONSUMABLE_REQ  : 'consumable_req',
    PD              : 'pd'
};

const STYPE_PREFIX = {
    support         : 'TKT',    //breakdown
    pm              : 'PMTKT',
    pd              : 'PDTKT',
    installation    : 'ITLTKT',
    inspection      : 'INSTKT',
    commissioning   : 'COMTKT',
    consumable_req  : 'FULTKT'
};

const SOURCE = {
    CUSTOMER_GENERATED  : 'customer_generated',    //breakdown
    HELP_DESK_CREATED   : 'help_desk_created',
    SYSTEM_GENERATED    : 'system_generated',
};

const SCHEMA_DEF= {
    name            : { //Nature of Complaint , category, product model , complaint type etc, derived field
        type        : String,
        required    : true,
        trim    : true
    },
    category        : {
        type        : String,
        trim    : true
    },
    subCategory     : {
        type        : String,
        trim    : true
    },
    desc            : {
        type        : String,
        trim    : true
    },
    code            : { //to display to the user
        type            : String,
        trim            : true,
        uppercase       : true,
        required        : true
    },
    seqId           : {
        type        : Number,
        required    : true
    },
    sType               : { //Service Type
        type            : String,
        default         : 'support',
        enum            : Object.values(STYPE)
    },
    subType             : {
        type            : String,
    },
    status              : {
        type            : String,
        required        : true,
        default         : TICKET_STATUS.OPEN,
        enum            : Object.values(TICKET_STATUS)
    },
    subStatus           : {
        type            : String
    },

    watchers            : [ObjectId],   //list of watchers, get notified of any event

    isFor               : {
        type            : String,
        default         : 'asset',
        enum            : ['asset', 'site']
    },
    siteId                : {
        type : ObjectId
    },
    site : {},
    clusterId              : {  //data filtering happens based on this
        type :ObjectId
    }, //populated from site mapping to cluster
    skuId                 : {   //todo: need to write populate
        type: ObjectId
    },
    sku: {},
    skuModel            : {
        type: String
    },
    skuQuantity         : {
        type : Number
    },
    assetOwnerType      : {
        type: String
    },
    warrantyStatus      : {
        type            : String
    },
    purchaseDate        : {
        type            : Date
    },

    custom              : {},  //how many skus => quantity, customer or dealer

    asset               : {
        ...CollSchemaShort,
        serialNumber    : {type: String},   
        secondarySerialNumber: {type: String},
        extraCode1      : {type: String},
        extraCode2      : {type: String},
        model           : Schema.Types.Mixed,
        contact         : {...ContactSchema},
        locatedAt       : {type: String},
        contract        : {}
    },
    meterReadings       : [{...CollSchemaShort, reading: Number}],
    customer            : {...CollSchemaShort},

    contact             : {...ContactSchema},

    address             : {...AddressSchema},
    childTicket         : {...CollSchemaShort},
    parentTicket        : {...CollSchemaShort},
    partReqRef          : {...CollSchemaShort},

    preferredDate       : {
        type            : Date
    },

    orgUnit             : {...CollSchemaShort},
    orgUnitIds          :[ObjectId],

    assignee            : {...CollSchemaShort},
    assignedOn          : {type: Date},

    lastEvent           : EventLogSchema,

    holdReason              : {type: String},
    holdRemarks             : {type: String},
    pausedOn                : {type: Date},

    isClosedFromWeb         : {type: Boolean},  //Closed from browser or app

    isCancelled             : {type: Boolean},
    cancellationRemarks     : {type: String},
    cancellationReason      : {type: String},

    consumables             : [{}], //consumablesRequested  during ticket creation, pending quantity added to this obj itself
    consumablesRequired     : [{
        ...Utils.CollSchemaShort,
        listPrice: {type: Number},
        quantity:  {type: Number}
    }], //For support ticket
    sparesRequired          : [{
        ...Utils.CollSchemaShort,
        listPrice: {type: Number},
        quantity:  {type: Number}
    }],

    startedOn               : {type : Date},    //work start
    finishedOn              : {type : Date},    //work end
    workDuration            : {type: Number},   //milliseconds
    completedOn             : {type : Date},    //ticket closure time (form submission perspective)

    feedback                : {
        message             : {type: String, trim: true},
        // rating              : {type: Number, default: 0},
        isSatisfied         : {type: Boolean},
    },

    sparesReplaced          : [Schema.Types.Mixed],
    consumablesFulfilled    : [Schema.Types.Mixed],
    isPartialFulfillment    : {type: Boolean},
    closure                 : {
        jobDone             : {type: String},
        repairType          : {type: String},   //deprecated
        reason				: {type: String},   //type of completion
        actions             : [{type:String}],  //to complete the job
        primaryDefectCode   : {...CollSchemaShort},
        secondaryDefectCode : {...CollSchemaShort},
        remarks             : {type: String},
    },
    isPaymentCollected      : {type :Boolean},
    payment                 : {
        amountCollected     : {type: Number},
        mode                : {type: String},
        transactionNumber   : {type: String},
        transactionDate     : {type: Date},
        remarks             : {type: String}
    },
    bill                    : {
        items               : [{
            iType           : {
                type        : String,
                enum        : ['service', 'consumable', 'spare']
            },
            id              : Mongoose.Types.ObjectId,
            name            : {type: String},
            unitPrice       : {type: Number},
            discount        : {type: Number},
            quantity        : {type: Number},
            totalPrice      : {type: Number},
            meta            : {}
        }],
        total               : {type: Number}
    },

    dueDate                 : {type: Date}, //for PM tickets
    dueDateChangeRemarks    : {type: String},
    tat                     : {type: Number}, //duration in minutes
    isTATExceeded           : {type: Boolean},
    resolutionTime          : {type: Number},   //duration in minutes

    charges                 : {
        service             : {
            type            : Number
        },
        inspection           : {
            type            : Number
        },
        installation        : {
            type            : Number
        }
    },
    services                : [{}],
    totalServiceCharge      : { type: Number },
    rateCard                : { ...CollSchemaShort },
    sparesCost 			    : {
        type 				: Number
    },
    consumablesCost         : {
        type                : Number
    },
    totalCost				: {
        type 				: Number
    },
       /**
     * @desc - key value pair like {assetPhoto: ObjectId, }
     * signature, outlet signage etc
     */
    media                   : {type:Schema.Types.Mixed},
    pmCheckList             :  {type:Schema.Types.Mixed},

    ref                     : {...CollSchemaShort},

    servicedByType          : {type: String},
    servicedByTypeName      : {type: String},
    servicedByEngineer      : {type: String},
    pkg                     : {},   //Used in case of consumable request
    
    source: {
        type: String,
        enum: Object.values(SOURCE)
    }

};

module.exports= {
    schema: function () {
        return {...SCHEMA_DEF};
    },
    TICKET_STATUS,
    STYPE,
    STYPE_PREFIX,
};
