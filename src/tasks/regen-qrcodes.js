
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Asset qr codes regenerating!', new Date());

    const Asset= app.locals.models.Asset;

    const updateAssets = (next) =>{
        let index= 0;
        Asset.find({}, (err, records)=>{
            if (err){
                return next(err);
            }
            Async.eachSeries(records, (record, next2)=>{
                ++index;
                console.log(`Processing ${index} of ${records.length}`);
                record.regenerateQRCode(next2);
            }, next);
        });
    };

    Async.series([updateAssets], doneCb);
}
