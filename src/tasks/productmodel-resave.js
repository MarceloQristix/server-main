
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Product Model updates!', new Date());

    const ProductModel= app.locals.models.ProductModel;

    const updateProductModels = (next) =>{
        ProductModel.find({}, (err, records)=>{
            if (err){
                return next(err);
            }
            Async.eachSeries(records, (record, next2)=>{
                record.save(next2);
            }, next);
        });
    };

    Async.series([updateProductModels], doneCb);
}
