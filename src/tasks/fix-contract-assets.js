
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Contract to Asset mapping correction!', new Date());
    const Contract= app.locals.models.Contract;
    const Asset= app.locals.models.Asset;

    let by = app.locals.admin;
    console.log('about to get contracts ');
    let cond= {
       status:{$in:['03_active']}
    };
    let multipleContracts= [];
    Contract.find(cond, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        console.log('>>>>active contracts', records.length);
        const updateRecord= (record, next)=>{
            console.log('Checking ', record.code);
            let assetIds= [];
            record.assets.forEach((asset)=>{
                assetIds.push(asset._id);
            });
            let numAssets= 0;
            Asset.find({_id:assetIds}, (err, assetRecords)=>{
                if(err){
                    return next(err);
                }
                const attachContract= (asset, next2)=>{
                    if (asset.contract.code === record.code){
                        console.log('mapping is proper for ', asset.code, record.code);
                        return next2();
                    }
                    if (!asset.contract?.code){
                        numAssets++;
                        return asset.attachContract(by, record, next2);
                    }
                    else {
                        console.log('Asset tagged to different contract:', record.code, asset.contract.code);
                        multipleContracts.push({secondContract: record.code, currentContract: asset.contract.code, code: asset.code, _id:asset._id});
                        return next2();
                    }
                };
                Async.eachSeries(assetRecords, attachContract, next);
            });
        };
        Async.eachSeries(records, updateRecord, ()=>{
            const Ticket= app.locals.models.Ticket;
            console.log(multipleContracts);
            const removeSecondContract= (asset, next)=>{
                console.log(`removing asset ${asset.code} from ${asset.secondContract.code}`);
                Contract.findOne({code: asset.secondContract}, (err, record)=>{
                    record.numAssets= record.numAssets- 1;
                    record.assets.pull({_id:asset._id});
                    record.save(()=>{
                        console.log('removing tickets for asset: ', asset.code);
                        Ticket.deleteMany({sType:'pm', 'asset._id': asset._id, status:{$nin:['05_closed', '06_cancelled', '05_cancelled']}}, next);
                    });
                });
            };
            Async.eachSeries(multipleContracts, removeSecondContract, doneCb);
        });
    });
}
