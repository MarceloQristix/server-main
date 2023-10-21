/**
 * @desc Defines Item attributes which are common to product, spare and and consumable
 */

const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');

const Utils = require('../utils');
const CollSchemaShort= Utils.CollSchemaShort;

const AbstractItemSchema = require('../abstract/item')();

const ProductBaseFields = {
    warranty    : { //days - overall warranty
        type    : Number
    },
    mainPartName: {
        type    : String,
        trim    : true
    },
    mainPartWarranty: {
        type    : Number
    },
    secondaryPartName: {
        type    : String,
        trim    : true
    },
    secondaryPartWarranty: {
        type    : Number
    },
    isInstallationApplicable: {
        type    : Boolean,
        default : false
    },
    isPMApplicable: {
        type    : Boolean,
        default : false
    },
    tat             : { //minutes
        local       : Number,
        upcountry   : Number
    },
    charges         : {
        local       : {
            service  : Number,
            inspection: Number,
            installation: Number
        },
        upcountry   : {
            service  : Number,
            inspection: Number,
            installation: Number
        }
    },
    hasMeters: {
        type: Boolean
    },
    meterTypes:{
        type: [{...CollSchemaShort}],
        set: function (arr){
            if (!arr || (arr.length === 0)){
                return arr;
            }
            if (typeof arr[0] !== 'string'){
                return arr;
            }
            let newArr= [];
            //Typecast string to ObjectId
            for (let index=0;index<arr.length; index++) {
                if (typeof arr[index] !== 'string'){
                    continue;
                }
                newArr[index]= {_id: Mongoose.Types.ObjectId(arr[index])};
            }
            return newArr;
        }
    }
};

module.exports= function () {
    return Object.assign(Lodash.cloneDeep(ProductBaseFields), Lodash.cloneDeep(AbstractItemSchema));
};
