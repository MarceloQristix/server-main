
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

const Aliases = {
    "ACCESS POINT": "ARUBA",
    "Develop MFP": "DEVELOP",
    "FRANKING MACHINE":	"POSTALIA"
}
module.exports = function (app, doneCb){
    console.log("About to execute load product models !!");
    const Product= app.locals.models.Product;
    const ProductModel= app.locals.models.ProductModel;
    const MeterType = app.locals.models.MeterType;

    const dataDef= Utils.processDataDef('productmodels')
    let by = app.locals.admin._id;
    let missingProducts= {};

    let skippedMeters= {};
    let stats= {
        total: {
            count: 0
        },
        skipped: {
            count: 0,
        },
        skippedEmpty: {
            count: 0
        },
        skippedMissingProducts: {
            count: 0
        }
    };
    let skippedEmpty= {};
    let skippedMissingProducts= {};

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
            let productMap= {};
            let meterTypeMap= {};
            let allMeterTypes= [];
            const loadProducts = (next)=>{
                Product.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        productMap[record.name.toLowerCase()]= record;
                    });
                    return next();
                });
            };

            const loadMeterTypes =(next)=>{
                MeterType.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        meterTypeMap[Utils.normalizeString(record.name)]= record;
                        allMeterTypes.push(record.getShortForm());
                    });
                    return next();
                });
            };

            const createOrUpdateModels = (next) =>{
                let index= 0;
                const loadRecord = (data, next2)=>{
                    index++;
                    if (!data.name){    //skip empty
                        console.log('ERROR');
                        skippedEmpty[index]= data.name;
                        return next2();
                    }
                    let productModel;
                    const updateProductModel= (next3) =>{
                        console.log('productName', data.productName);
                        if (!data.productName){
                            console.log('skipping model', data.name);
                            skippedMissingProducts[index]= data.name;
                            return next3();
                        }
                        data.code=data.productName+' '+data.name;
                        let product= productMap[(Aliases[data.productName]||data.productName).toLowerCase()];
                        if (!product){
                            console.log('skipping model due to product not found', data.name);
                            skippedMissingProducts[index]= data.name;
                            if (!missingProducts[data.productName]){
                                missingProducts[data.productName]= 0;
                            }
                            missingProducts[data.productName]++;

                            return next3();
                        }
                        data.product={
                            _id: product._id
                        };
                        if (data.meter){
                            data.meterTypes =[];
                            for (let key in data.meter){
                                if (!data.meter[key]){
                                    continue;
                                }
                                if (!meterTypeMap[key]){
                                    console.log('meter not found!', key);
                                    if (!skippedMeters[key]){
                                        skippedMeters[key]= [];
                                    }
                                    skippedMeters[key].push(data.productName);
                                }
                                if (data.meter[key].toLowerCase().indexOf('y') !== -1){
                                    data.meterTypes.push({_id:meterTypeMap[key]._id})
                                }
                            }
                            if (data.meterTypes.length === 0){
                                data.hasMeters= false;
                            }
                            else {
                                data.hasMeters= true;
                            }
                        }
                        else {
                            if (product.meterTypes){
                                data.meterTypes= {...product.meterTypes};
                            }
                            else {
                                data.meterTypes= [];
                            }
                            data.hasMeters= product.hasMeters;
                        }
                        ProductModel.findOne({code:data.code}, (err, record)=>{
                            if (err){
                                return next3(err);
                            }
                            if (record) {
                                productModel= record;
                            }
                            else {
                                productModel= new ProductModel({
                                    createdBy:by
                                });
                            }
                            for (let key in data){
                                productModel.set(key, data[key]);
                                productModel.markModified(key);
                            }
                            productModel.lastModifiedBy= by;
                            productModel.save(next3);
                        });
                    };
                    Async.series([updateProductModel], next2);
                };
                Async.eachSeries(rows, loadRecord, next);
            };

            Async.series([loadProducts, loadMeterTypes, createOrUpdateModels], (err)=>{
                if (err){
                    console.log(err);
                }
                console.log('Skipped meters', skippedMeters);
                console.log('Skipped empty', skippedEmpty);
                console.log('Skipped product', skippedMissingProducts);
                console.log('missing products', missingProducts);
                return doneCb(err);
            });
        });
}
