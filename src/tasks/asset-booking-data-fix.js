
const Async = require('async');
const {toDate} = require('../lib/DateUtils');

module.exports = function (app, doneCb){
    console.log('Asset text search updates!', new Date());

    const Asset= app.locals.models.Asset;
    const Contract= app.locals.models.Contract;

    const updateAssets = (next) =>{
        let index= 0;
        Asset.find({status:{$ne:'01_draft'}, 'custom.tentativeDeliveryQuoted': {$exists:true}}, (err, records)=>{
            if (err){
                return next(err);
            }
            Async.eachSeries(records, (record, next2)=>{
                ++index;
                console.log(`Processing ${index} of ${records.length}`);
                // record.custom.tentativeDeliveryQuotedFmt= toDate(record.custom.tentativeDeliveryQuoted, 'YYYY-MM-DD') + ':'+record.custom.tentativeDeliveryQuoted;
                record.custom.tentativeDeliveryQuotedFmt= toDate(record.custom.tentativeDeliveryQuoted, 'DD MMM YY') ||'';
                record.markModified('custom');
                record.save(next2);
            }, next);
        });
    };

    Async.series([updateAssets], doneCb);
}
