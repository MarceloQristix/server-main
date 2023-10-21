/**
 * @desc Defines Item attributes which are common to product, spare and and consumable
 */

const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Utils = require('../utils');
const CollSchemaShort= Utils.CollSchemaShort;

const ITEM_STATUS= {
    DRAFT       : 'draft',  //needs an approval kind of
    ACTIVE      : 'active',
    INACTIVE    : 'inactive' //discontinued etc
};

const ITEM_SCHEMA = {
    name        : {
        type    : String,
        required: true,
        trim    : true
    },
    displayName : {
        type    : String,
        trim    : true
    },
    desc        : {
        type    : String,
        trim    : true
    },
    code        : {
        type    : String,
        trim    : true,
        unique  : true
    },
    seqId       : {
        type    : Number
    },
    secondaryCode   : {
        type        : String,
        trim        : true
    },
    // eanCode     : { // Or UPC code
    //     type    : String,
    // },
    HSNCode         : {
        type        : String,
        trim        : true
    },
    brand           : {
        type        : String,
        trim        : true
    },
    manufacturer    : {
        type        : String,
        trim        : true
    },
    category        : {
        ...CollSchemaShort,
        parent      : {
            _id     : ObjectId
        }
    },
    status          : {
        type        : String,
        default     : ITEM_STATUS.ACTIVE,
        required    : true,
        enum        : Object.values(ITEM_STATUS)
    },
    listPrice   : {
        type    : Number,
    },
    attrs       : {},
    uom         : { //unit of measure *packQuantity => total volume
        type    : String,
        trim    : true
    },
    packingType : {
        type    : String,
    },
    remarks         : {
        type        : String
    }
};

module.exports= function () {
    return {...ITEM_SCHEMA};
};
