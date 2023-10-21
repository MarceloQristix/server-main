
const Async = require('async');

module.exports = function (app, doneCb){
    let modelName= process.argv[5];

    console.log(`Re save for ${modelName} starting at ${new Date()}`);

    const DbModel= app.locals.models[modelName];
    let total= 0, counter=0;
    let ids= [];
    let filterCond= {};

    if (modelName === 'Asset'){
        filterCond.status= {$nin:['01_draft']};
    }
    if (!DbModel){
        return doneCb('given db model does not exist!');
    }

    const loadRecordIds= (next)=>{
        DbModel.distinct('_id', filterCond, (err, recordIds)=>{
            if (err){
                return next(err);
            }
            ids= recordIds;
            total= ids.length;
            return next();
        });
    };

    const reSaveRecords= (next)=>{
        const reSaveById= (id, next2)=>{
            counter++;
            console.log(`Processing ${counter} of ${total}`);
            DbModel.findById(id, (err, record)=>{
                if (err){
                    return next2(err);
                }
                if (!record){
                    return next2('record Not found Fatal'+id);
                }
                record.save(next2);
            });
        }
        Async.eachSeries(ids, reSaveById, next);
    };

    Async.series([loadRecordIds, reSaveRecords], (err)=>{
        if (err){
            console.error('There is an error', err);
            console.log(`Processed ${counter} of ${total}`);
        }
        doneCb(err);
    });
}
