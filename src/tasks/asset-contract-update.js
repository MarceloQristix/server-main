
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Asset contract details update!', new Date());

    const Asset= app.locals.models.Asset;
    const Contract= app.locals.models.Contract;

    Asset.find({status:{$nin:['01_draft']}, contract: {$exists: true}}, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        const populateContract= (record, next2) =>{
            Contract.findById(record.contract._id, (err, contract)=>{
                if (err){
                    return next2(err);
                }
                if (!contract){
                    return next2(`contract${record.contract._id} not found!`);
                }
                record.contract= contract.getShortForm();
                record.markModified('contract');
                record.save(next2);
            });
        }
        Async.eachSeries(records, populateContract, doneCb);
    });
}
