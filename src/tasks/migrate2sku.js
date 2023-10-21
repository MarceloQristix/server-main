
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Product Model updates!', new Date());

    const Product= app.locals.models.Product;
    const ProductModel= app.locals.models.ProductModel;
    const Accessory= app.locals.models.Accessory;
    const SparePart= app.locals.models.SparePart;
    const Consumable= app.locals.models.Consumable;
    const SKU= app.locals.models.SKU;

    const stats= {};
    let skippedModelKeys= {};

    const productMap= {};

    const loadProducts= (next)=>{
        Product.find({}, (err, records)=>{
            if (err){
                return next(err);
            }
            records.forEach((record)=>{
                productMap[record._id.toString()]= record.toObject();
            });
            stats.productsCount= records.length;
            return next();
        });
    };

    const copyModels= (next) =>{
        ProductModel.find({}, (err, records)=>{
            if(err){
                return next();
            }
            stats.modelsCount= records.length;
            const copy2SKU= (record, next2)=>{
                let product= productMap[record.product._id.toString()];
                let data;
                if (product){
                    data= JSON.parse(JSON.stringify(product));
                    data.product= product.name;
                    delete data.hasMeters;
                    delete data.meterTypes;
                }
                let model= record.toObject();
                delete model.product;
                for (let key in model){
                    if (!model[key]){
                        if (key === 'hasMeters'){
                            data.hasMeters= false;
                            delete data.meterTypes;
                        }
                        else {
                            skippedModelKeys[key]= true;
                        }
                        continue;
                    }
                    data[key]= model[key];
                }
                data.mType= 'product';
                data._id= record._id;

                // console.log(product);
                // console.log(record);
                // console.log(data);

                SKU.findOneAndUpdate(
                    { _id:  record._id},
                    { $set: data},
                    { upsert: true, new: true} ,
                    (err)=>{
                        if(err){
                            return next2(err);
                        }
                        return next2();
                    }
                );
            };

            Async.eachSeries(records, copy2SKU, (err)=>{
                if(err){
                    return next(err);
                }
                SKU.countDocuments({mType:'product'}, (err, count)=>{
                    if(err){
                        return next(err);
                    }
                    stats.modelSKUCount= count;
                    return next();
                });
            });
        });
    };

    const copySpareParts= (next)=>{
        SparePart.find({}, (err, records)=>{
            if(err){
                return next();
            }
            stats.sparePartsCount= records.length;
            const copy2SKU= (record, next2)=>{
                let data= record.toObject();
                data.mType= 'sparePart';
                data._id= record._id;
                data.secondaryCode= data.code;
                data.code= 'SPARE'+data.seqId;
                SKU.findOneAndUpdate(
                    { _id:  record._id},
                    { $set: data},
                    { upsert: true, new: true} ,
                    (err)=>{
                        if(err){
                            return next2(err);
                        }
                        return next2();
                    }
                );
            };

            Async.eachSeries(records, copy2SKU, (err)=>{
                if(err){
                    return next(err);
                }
                SKU.countDocuments({mType:'sparePart'}, (err, count)=>{
                    if(err){
                        return next(err);
                    }
                    stats.sparePartSKUCount= count;
                    return next();
                });
            });
        });
    };

    const copyConsumables= (next)=>{
        Consumable.find({}, (err, records)=>{
            if(err){
                return next();
            }
            stats.consumableCount= records.length;
            const copy2SKU= (record, next2)=>{
                let data= record.toObject();
                data.mType= 'consumable';
                data._id= record._id;
                data.secondaryCode= data.code;
                data.code= 'CONS'+data.seqId;
                SKU.findOneAndUpdate(
                    { _id:  record._id},
                    { $set: data},
                    { upsert: true, new: true} ,
                    (err)=>{
                        if(err){
                            return next2(err);
                        }
                        return next2();
                    }
                );
            };

            Async.eachSeries(records, copy2SKU, (err)=>{
                if(err){
                    return next(err);
                }
                SKU.countDocuments({mType:'consumable'}, (err, count)=>{
                    if(err){
                        return next(err);
                    }
                    stats.consumableSKUCount= count;
                    return next();
                });
            });
        });
    };

    const copyAccessories= (next)=>{
        Accessory.find({}, (err, records)=>{
            if(err){
                return next();
            }
            stats.accessoriesCount= records.length;
            const copy2SKU= (record, next2)=>{
                let data= record.toObject();
                data.mType= 'accessory';
                data._id= record._id;
                data.secondaryCode= data.code;
                data.code= 'ACC'+data.seqId;
                SKU.findOneAndUpdate(
                    { _id:  record._id},
                    { $set: data},
                    { upsert: true, new: true} ,
                    (err)=>{
                        if(err){
                            return next2(err);
                        }
                        return next2();
                    }
                );
            };

            Async.eachSeries(records, copy2SKU, (err)=>{
                if(err){
                    return next(err);
                }
                SKU.countDocuments({mType:'accessory'}, (err, count)=>{
                    if(err){
                        return next(err);
                    }
                    stats.accessoriesSKUCount= count;
                    return next();
                });
            });
        });
    };

    const updateAssets= (next)=>{

        return next();
    };

    const updateTickets= (next)=>{
        return next();

    };

    const updateContracts= (next)=>{
        return next();
    };

    let tasks= [
        loadProducts,
        copyModels,
        copySpareParts,
        copyConsumables,
        copyAccessories,
        updateAssets,
        updateTickets,
        updateContracts
    ]
    Async.series(tasks, (err)=>{
        if(err){
            console.log(err);
        }
        console.log(stats);
        console.log(skippedModelKeys);
        doneCb(err);
    });
}
