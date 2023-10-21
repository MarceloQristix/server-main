
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

module.exports = function (app, doneCb){
    console.log("About to execute load products !!");
    const Product= app.locals.models.Product;
    const ProductCategory = app.locals.models.ProductCategory;

    const dataDef= Utils.processDataDef('products')
    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    CSV({colParser: dataDef.colParser})
        .fromFile(csvFilePath)
        .preFileLine((fileLineString, lineIdx)=>{
            if (lineIdx === 0){
                return Utils.transformHeader(fileLineString, dataDef);
            }
            return fileLineString;
        })
        .then((rows)=>{
            const loadRecord = (data, next)=>{
                if (!data.name){    //skip empty
                    console.log('ERROR');
                    return next();
                }
                let product, category;
                const loadOrCreateCategory= (next2) =>{
                    ProductCategory.findOne({name: data.category}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record){
                            category= record;
                            return next2();
                        }
                        category= new ProductCategory({createdBy: by, name: data.category});
                        category.save(next2);
                    });
                };
                const updateProduct= (next2) =>{
                    data.code=data.name;
                    data.category= category.getShortForm();
                    Product.findOne({name:data.name}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record) {
                            product= record;
                        }
                        else {
                            product= new Product({
                                createdBy:by
                            });
                        }
                        for (let key in data){
                            product.set(key, data[key]);
                            product.markModified(key);
                        }
                        product.lastModifiedBy= by;
                        product.save(next2);
                    });
                };
                Async.series([loadOrCreateCategory, updateProduct], next);
            };
            Async.eachSeries(rows, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
