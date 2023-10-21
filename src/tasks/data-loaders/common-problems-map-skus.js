
const Async = require('async');

module.exports = function (app, doneCb){
    console.log("About to map sku to common problems !!");

    const SKU= app.locals.models.SKU;
    const CommonProblem= app.locals.models.CommonProblem;

    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    const csv= require('csvtojson')
    csv()
        .fromFile(csvFilePath)
        .then((jsonObj)=>{
            // console.log(jsonObj);

            let total= jsonObj.length;
            let index= 0;

            const loadRecord = (data, next)=>{
                if (!data.skuName){    //skip empty
                    return next();
                }
                let record;
                index++;
                console.log('processing '+index + ' of '+total);
                const map2CommonProblem= (next2) =>{
                    console.log(data);
                    data.skuName= (data.skuName||'').trim();
                    data.problemDesc= (data.problemDesc||'').trim();
                    if (!data.skuName || !data.problemDesc){
                        console.log('skipping '+index);
                        return next2();
                    }
                    SKU.distinct("_id", {name: data.skuName}, (err, skuIds)=>{
                        if(err){
                            return next2();
                        }
                        console.log('skuIds', skuIds);
                        CommonProblem.updateOne({name:data.problemDesc}, {$addToSet:{skuIds, skus:skuIds}}, (err)=>{
                            if(err){
                                return next2(err);
                            }
                            return next2();
                        });
                    });
                };

                Async.series([map2CommonProblem], (err)=>{
                    if (err){
                        console.log('processing completed with error for '+index + ' of '+total);
                        return next(err);
                    }
                    console.log('processing completed successfully for '+index + ' of '+total);
                    return next();
                });
            };
            Async.eachSeries(jsonObj, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
