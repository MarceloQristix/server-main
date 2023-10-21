
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Common problems migration to move name from _id!', new Date());

    const CommonProblem= app.locals.models.CommonProblem;
    let by= app.locals.admin._id;

    const migrate2V2= (topNext)=>{
        CommonProblem.find({version: {$exists: false}}, (err, records)=>{
            const createNewVersion= (record, next)=>{
                let v2doc= new CommonProblem({
                    name: record.name+'V2',
                    createdBy: by
                });
                if (record.skuIds){
                    v2doc.skuIds= [...record.skuIds]
                }
                if (record.skus){
                    v2doc.skus= [...record.skus]
                }
                v2doc.save((err)=>{
                    if(err){
                        return next(err);
                    }
                    return next();
                });
            };

            Async.eachSeries(records, createNewVersion, (err)=>{
                if(err){
                    console.log('error while migration', err);
                }
                topNext(err);
            });
        });
    };

    const removeOldRecords= (topNext)=>{
        CommonProblem.countDocuments({version: {$exists: true}}, (err, count)=>{
            if(err){
                return topNext(err)
            }
            if(count===0){
                return topNext('looks like migration is unsuccessful');
            }
            CommonProblem.remove({version:{$exists:false}}, topNext);
        });
    };

    const trimV2FromName=(topNext)=>{
        CommonProblem.find({version: {$exists: true}}, (err, records)=>{
            const trimV2InDoc= (record, next)=>{
                record.name= record.name.replace('V2','');
                record.save(next);
            };
            Async.eachSeries(records, trimV2InDoc, topNext);
        });
    };

    Async.series([
        migrate2V2,
        removeOldRecords,
        trimV2FromName
    ], doneCb);
}
