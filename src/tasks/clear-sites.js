
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Clearing Duplicate Sites!', new Date());

    const Site= app.locals.models.Site;

    // let cond= {
    //     seqId: {$gte: 24, $lte:42 }
    // };
    Site.find(cond, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        let index=0;
        let total= records.length;
        const clearSiteData= (record, next2) =>{
            index++;
            record.reset2Draft();
            console.log(`Resetting ${index} of ${total} - ${record.code}`);
            record.save(next2);
        }
        Async.eachSeries(records, clearSiteData, doneCb);
    });
}
