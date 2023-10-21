/**
 * @desc : Initializes all the mongodb models
 * @param app
 */

const Async = require('async');
const Mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const idPlugin = require('mongoose-id');
const defaultPlugin = require('./_plugins/default');

let isInitialized = false;

const load = (app, group, cb) => {
    if (!isInitialized) {
        Mongoose.plugin(mongoosePaginate);
        Mongoose.plugin(idPlugin);
        Mongoose.plugin(defaultPlugin);
        isInitialized = true;
    }
    const COLLECTIONS = {
        global: [
            'Counter',  //Should be the first one due to dependency in other collections
            'User',
            'Organization',
            'State',
            'City',
            'Country'
        ],
        org: [
            'Counter',  //Should be the first one due to dependency in other collections
            'Accessory',
            'Asset',
            'Consumable',
            'Contract',
            'Customer',
            'EventLog',
            'ProductModel',
            'OrgUnit',
            'OrgUser',
            'Product',
            'ProductCategory',
            'Report',
            'Ticket',
            'SparePart',
            'MeterType',
            'CommonProblem',
            'Site',
            'Service',
            'Attendance',
            'RateCard',
            'Vendor',
            'PartRequisition',
            'Cluster',
            'SKU',
            'Form',
            'File',
            'Campaign',
            'Notification',
            'PurchaseOrder',
            'TktDailyStats',
            'Task',
            'Enquiry',
            'OrgUnitRunningStats'
        ]
    };

    Async.eachSeries(COLLECTIONS[group], (collection, next2) =>{
        require(`./${group}/${collection}`)(app, next2);
    }, (err) => {
        cb(err);
    });
};

module.exports = {
    load: load
};

