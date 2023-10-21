
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Contract Status updating based on today!', new Date());
    const Contract= app.locals.models.Contract;

    let by = app.locals.admin;
    console.log('about to get contracts ');
    let cond= {
       status:{$in:['01_draft', '03_active']}
    };
    Contract.find(cond, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        console.log('>>>>active contracts', records.length);
        const updateRecord= (record, next)=>{
            console.log('Checking ', record.code, record.pmSchedule);
            record.save((err)=>{
                if(err){
                    console.log(err);
                    return next(err);
                }
                console.log('Checking ', record.code, record.pmSchedule);
                try{
                    record.generateNextPms(by, next);
                }
                catch(e){
                    console.log('error',e);
                }
            });
        };
        Async.eachSeries(records, updateRecord, doneCb);
    });
}
