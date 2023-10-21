
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Running Customer Stats...', new Date());
    const Customer= app.locals.models.Customer;

    Customer.find({deleted: {$ne: false}}, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        const updateRecord= (record, next)=>{
            record.computeStats(next);
        };
        Async.eachSeries(records, updateRecord, doneCb);
    });
}
