
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Populating first name from name field!', new Date());
    const OrgUser= app.locals.models.OrgUser;

    console.log('about to get contracts ');
    OrgUser.find({}, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        const updateRecord= (record, next)=>{
            record.firstName= record.name;
            record.save(next);
        };
        Async.eachSeries(records, updateRecord, doneCb);
    });
}
