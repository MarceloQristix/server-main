
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Asset text search updates!', new Date());

    const Asset= app.locals.models.Asset;
    const Contract= app.locals.models.Contract;

    const updateAssets = (next) =>{
        let index= 0;
        Asset.find({status:{$ne:'01_draft'}}, (err, records)=>{
            if (err){
                return next(err);
            }
            Async.eachSeries(records, (record, next2)=>{
                ++index;
                console.log(`Processing ${index} of ${records.length}`);
                if (!record.contract?._id){
                    return next2();
                }
                Contract.findById(record.contract._id, (err, contract)=>{
                    if (err){
                        return next2(err);
                    }
                    if (!contract){
                        return next2('contract not found!');
                    }
                    record.contract.referenceNumber= contract.referenceNumber;
                    record.contract.cType= contract.cType;
                    record.save((err)=>{
                        console.log(err);
                        return next2();
                    });
                });
            }, next);
        });
    };

    Async.series([updateAssets], doneCb);
}
