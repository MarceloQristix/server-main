/**
 *  @description: Most of the schemas use this plugin for getting seqId,code generation functionality
 */
const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

module.exports = function defaultFields(schema, options) {

    //FIXME: there is no provision to have async stuff here, needed for initializing counter
    schema.pre('save', function (next) {

        next();
    });

};
