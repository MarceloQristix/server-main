/**
 * @desc Contains EventLog Schema
 */
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Utils = require('../utils');
const CollSchemaShort= Utils.CollSchemaShort;

const SCHEMA_DEF= {
    scope           : {
        _id         : ObjectId,
        sType       : {
            type    : String
        },
        code        : String    //Contract no, ticket no, asset code etc
    },
    /**
     * @desc - If this flag is set, the message is not shown to the customer
     */
    isInternal      : {type: Boolean, default: false},
    evtType         : { //Used for filtering
        type        : Number,
    },
    name            :{
        type        : String,
        trim        : true
    },
    desc            : {
        type        : String,
        trim        : true
    },
    details         : { },
    extras          : { },
    when            : { //CreatedOn will be different from this in cases where offline syncing happens from mobile app
        type        : Date,
        default     : Date.now
    },
    doneBy          : {
        ...CollSchemaShort,
    },
    client          : {
        ua          : {type: String},
        ipAddress   : {type: String},
        appVersion  : {type: String}
    },
    loc             : {
        lat         : {type: Number},
        lng         : {type: Number},
    }
};

module.exports= {
    schema: function () {
        return {...SCHEMA_DEF};
    },
};
