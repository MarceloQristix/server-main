
const Async = require('async');
const {toDate} = require('../lib/DateUtils');

module.exports = function (app, doneCb){
    console.log('Asset clear if dealer code not set!', new Date());

    const Asset= app.locals.models.Asset;
    let tobeUpdated= [];
    let tobeCleared= [];
    let tobeUpdatedDealerCodes= {};
    let tobeClearedDealerCodes= {};
    const loadAssetIds= (next) =>{
        let cond= {
            status:{$nin:['01_draft']},
            'orgUnit._id': {$exists:true}
        }
        Asset.find(cond,{ _id:1}, (err, records)=>{
            if (err){
                return doneCb(err);
            }
            let index=0;
            let total= records.length;
            const checkAssetSerialNumber= (asset, next2) =>{
                index++;
                Asset.findById(asset._id, (err, origRecord)=>{
                    if(origRecord.serialNumber.indexOf(origRecord.orgUnit.code) ===0) {
                        return next2();
                    }
                    let rightSerialNumber= [origRecord.orgUnit.code, origRecord.serialNumber].join('')
                    Asset.findOne({serialNumber: rightSerialNumber}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record){
                            tobeCleared.push(record.serialNumber);
                            tobeClearedDealerCodes[record.orgUnit.code]= record.orgUnit.name;
                            origRecord.reset2Draft();
                            origRecord.save(next2);
                            return;
                        }
                        tobeUpdated.push(origRecord.serialNumber);
                        tobeUpdatedDealerCodes[origRecord.orgUnit.code]= origRecord.orgUnit.name;
                        origRecord.serialNumber= rightSerialNumber;
                        origRecord.save(next2);
                    });
                });
            }
            Async.eachSeries(records, checkAssetSerialNumber, (err)=>{
                console.log('toUpdate:', tobeCleared.length);
                console.log('toClear:', tobeUpdated.length);
                console.log('dealers to be cleared:', tobeClearedDealerCodes);
                console.log('dealers to be updated:', tobeUpdatedDealerCodes);
                next(err);
            });
        });
    }

    const steps=[
        loadAssetIds,
    ]

    Async.series(steps, doneCb);

}
