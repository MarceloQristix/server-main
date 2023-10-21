
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Clearing Assets!', new Date());

    const Asset= app.locals.models.Asset;

    let cond= {
        'customer._id': {$exists: true},
        status:{$nin:['01_draft']}
    }
    Asset.find(cond, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        let index=0;
        let total= records.length;
        const clearAssetData= (record, next2) =>{
            index++;
            record.reset2Draft();
            console.log(`Resetting ${index} of ${total} - ${record.code}`);
            record.save(next2);
        }
        Async.eachSeries(records, clearAssetData, doneCb);
    });
}
