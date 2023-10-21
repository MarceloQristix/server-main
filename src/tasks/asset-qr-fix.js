
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Asset public Code sync based on generated QRCode!', new Date());
    const Asset= app.locals.models.Asset;

    console.log('about to get assets ');
    Asset.find({}, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        const updateRecord= (record, next)=>{
            record.save(next);
        };
        Async.eachSeries(records, updateRecord, doneCb);
    });
}
