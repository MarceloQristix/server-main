
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Asset text search updates!', new Date());

    const Asset= app.locals.models.Asset;
    const Customer= app.locals.models.Customer;

    Asset.find({status:{$ne:'01_draft'}, 'customer._id':{$exists:true},'address.addrLine1':{$exists:false}}, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        let index=0, total= records.length;
        const syncAddress= (record, next)=>{
            index++;
            console.log(`updating {$index} of ${total}`);
            Customer.findOne(record.customer._id, (err, customer)=>{
                if (err){
                    return next(err);
                }
                if (!customer){
                    return next('customer not found!');
                }
                record.address= {...customer.address};
                record.markModified('address');
                record.save(next);
            });
        };
        Async.eachSeries(records, syncAddress, (err)=>{
            console.log(`Updated ${index} of ${total}`);
            doneCb(err);
        });
    });

}
