
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Asset name updates!', new Date());

    const Asset= app.locals.models.Asset;
    const Product = app.locals.models.Product;
    const ProductModel = app.locals.models.ProductModel;

    let productMap= {};
    let modelMap= {};

    const updateProducts = (next) =>{
        Product.find({}, {}, (err, records)=>{
            if (err){
                return next();
            }
            Async.eachSeries(records, (record, next2)=>{
                productMap[record._id.toString()]= record;
                record.save(next2);
            }, next);
        });
    };

    const updateProductModels = (next) =>{
        ProductModel.find({}, {}, (err, records)=>{
            if (err){
                return next();
            }
            Async.eachSeries(records, (record, next2)=>{
                record.product= productMap[record.product._id.toString()].getShortForm();
                record.markModified('product');
                modelMap[record._id.toString()]= record;
                record.save(next2);
            }, next);
        });
    };

    const updateAssets = (next) =>{
        Asset.find({status:{$nin:['01_draft']}}, (err, records)=>{
            if (err){
                return next(err);
            }
            Async.eachSeries(records, (record, next2)=>{
                record.model= modelMap[record.model._id.toString()].getShortForm();
                record.markModified('model');
                record.save(next2);
            }, next);
        });
    };

    Async.series([updateProducts, updateProductModels, updateAssets], doneCb);
}
