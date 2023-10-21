
const Async = require('async');

module.exports = function (app, doneCb){
    console.log("About to migrate!!");
    const ProductModel= app.locals.models.ProductModel;

    let by = app.locals.admin._id;

    ProductModel.find({}, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        const updateRecord= (record, next)=>{
            record.save(next);
        };
        Async.eachSeries(records, updateRecord, doneCb);
    });
}
