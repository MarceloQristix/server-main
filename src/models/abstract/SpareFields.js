/**
 * @desc Defines Item attributes which are common to product, spare and and consumable
 */

const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const Utils = require('../utils');
const CollSchemaShort= Utils.CollSchemaShort;

const AbstractItemSchema = require('../abstract/item')();

const SpareFields = {
    mType       : {
        type    : String
    },
    warranty    : { //days - overall warranty
        type    : Number,
    },
    packQuantity : {    //not quantity but some field to capture the volume
        type    : Number,
    },
    isReturnable: {
        type    : Boolean,
    },
    expectedYield :{    /// Life

    },
    productsCompatible  : [ObjectId],
    modelsCompatible    :[ObjectId],
    tags    : [String]
};

module.exports= function () {
    return Object.assign(SpareFields, AbstractItemSchema);
};
