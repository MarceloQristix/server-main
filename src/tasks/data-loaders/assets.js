
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');
const {getDeepObjectValue} = require("validate.js");

module.exports = function (app, doneCb){
    console.log("About to execute load Assets !!");
    const Asset= app.locals.models.Asset;
    const Customer= app.locals.models.Customer;
    const OrgUser= app.locals.models.OrgUser;
    const OrgUnit= app.locals.models.OrgUnit;
    const Contract= app.locals.models.Contract;
    const Product= app.locals.models.Product;
    const ProductModel= app.locals.models.ProductModel;
    const MeterType = app.locals.models.MeterType;

    const dataDef= Utils.processDataDef('assets')
    let by = app.locals.admin._id;
    let skipped= [];
    let skippedAssets= [['Row Number', 'Asset Serial', 'Reason for failure']];
    let stats= {
        customerWise: {},
        contractWise: {},
        total: 0,
        skipped: 0,
        skippedIds: [],
        modelWise: {}
    };
    const productWiseModels= {};

    const add2Skipped= (primaryIdentifier, asset, reason) =>{
        if (!skipped[reason]){
            skipped[reason]= [];
        }
        stats.skipped++;
        skipped[reason].push(asset.rowNumber);
        skippedAssets.push([asset.rowNumber, primaryIdentifier, reason]);
        console.log(reason, primaryIdentifier, asset);
    };

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
            let modelMap= {};
            let meterTypeMap= {};
            let customerMap= {};
            let technicianMap= {};
            let orgUnitMap= {};
            let contractMap= {};

            const loadCustomers= (next)=>{
                Customer.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        customerMap[record.name]= record;
                    });
                    return next();
                });
            };

            const loadContracts= (next)=>{
                Contract.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        contractMap[record.code]= record;
                    });
                    return next();
                });
            };

            const loadTechnicians= (next)=>{
                OrgUser.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        technicianMap[Utils.normalizeString(record.name)]= record;
                    });
                    return next();
                });
            };

            const loadOrgUnits= (next)=>{
                OrgUnit.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        orgUnitMap[record.name]= record;
                    });
                    return next();
                });
            };

            const loadProducts = (next)=>{
                Product.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        productMap[record._id.toString()]= record;
                    });
                    return next();
                });
            };

            const loadModels = (next)=>{
                ProductModel.find({}, (err, records)=>{
                    if (err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        let productName= productMap[record.product._id.toString()].name;
                        let name= record.name +' '+ productName;
                        modelMap[record.name]= record;
                        modelMap[name]= record;
                        modelMap[productName+' '+record.name]= record;
                        modelMap[Utils.normalizeString(name)]= record;
                        let normalizedProductName= Utils.normalizeString(productName);
                        if (!productWiseModels[normalizedProductName]){
                            productWiseModels[normalizedProductName]= {};
                        }
                        let normalizedModelName= Utils.normalizeString(record.name);
                        productWiseModels[normalizedProductName][normalizedModelName]= record;
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
                    });
                    return next();
                });
            };

            let contractWiseAssets= {};
            const groupByContract= (next) =>{
                let index=0;
                rows.forEach((asset)=>{
                    index++;
                    asset.rowNumber= index+1;
                    if (!asset.contractNumber) {
                        asset.contractNumber= 'NA';
                    }
                    if (!contractWiseAssets[asset.contractNumber]){
                        contractWiseAssets[asset.contractNumber]= [];
                    }
                    contractWiseAssets[asset.contractNumber].push(asset);
                })
                return next();
            };

            let notFoundModels= {};
            const mapAssets = (next) =>{
                const mapContractWiseAssets= (contractNumber, next2) =>{
                    let assets= contractWiseAssets[contractNumber];
                    let customer;
                    let technician;
                    let branch;
                    let productModel;
                    let contract;
                    let contractAssets= [];
                    if (contractNumber !== 'NA'){
                        contract= contractMap[contractNumber];
                    }
                    const mapContractAssets= (next3) =>{
                        let primaryIdentifier= 'serialNumber';
                        const mapAsset= (data, next4) =>{
                            stats.total++;
                            if (!data[primaryIdentifier]){    //skip empty
                                console.log('skipping empty asset');
                                add2Skipped(data[primaryIdentifier], data, 'serial number not found');
                                return next4();
                            }
                            customer= customerMap[data.customerName];
                            if (!data.productModel){
                                data.productModel= [data.product||'', data.model.replace('')].join(' ').trim();
                            }
                            data.productModel= data.productModel.replace('.','');

                            let pmName= data.productModel;
                            let pmNormalizedName= Utils.normalizeString(pmName);
                            productModel= modelMap[pmName];
                            if (!productModel){
                                productModel= modelMap[pmNormalizedName];
                            }
                            if (!productModel) {
                                let models = {};
                                let productMaxMatch= '';
                                for( let productNormalizedName in productWiseModels){
                                    if(pmNormalizedName.indexOf(productNormalizedName) !== -1){
                                        if (productMaxMatch.length < productNormalizedName.length){
                                            productMaxMatch= productNormalizedName;
                                            models = productWiseModels[productNormalizedName];
                                        }
                                    }
                                }
                                let modelMaxMatch= '';
                                for( let modelNormalizedName in models){
                                    if(pmNormalizedName.indexOf(modelNormalizedName) !== -1){
                                        if (modelMaxMatch.length <modelNormalizedName.length){
                                            productModel =  models[modelNormalizedName];
                                            modelMaxMatch= modelNormalizedName;
                                        }
                                    }
                                }
                            }
                            if(!productModel){
                                add2Skipped(data[primaryIdentifier], data, data.productModel);
                                if (!notFoundModels[data.productModel]){
                                    notFoundModels[data.productModel]= 0;
                                }
                                notFoundModels[data.productModel]++;
                                return next4();
                            }
                            if (!customer){
                                add2Skipped(data[primaryIdentifier], data, 'customer not found');
                                return next4();
                            }
                            technician= technicianMap[Utils.normalizeString(data.technician)];
                            let asset;
                            let isExisting= false;
                            const loadExisting= (next5)=> {
                                let condition= { };
                                condition[primaryIdentifier]= data[primaryIdentifier];
                                Asset.findOne(condition, {}, {sort: {seqId: -1}}, (err, record) => {
                                    if (err) {
                                        return next5(err);
                                    }
                                    if (record) {
                                        isExisting = true;
                                        asset = record;
                                    }
                                    return next5();
                                });
                            };

                            const loadDraft= (next5) =>{
                                if (asset){
                                    return next5();
                                }
                                let condition= {
                                    status:'01_draft'
                                };
                                condition[primaryIdentifier]= {$exists:false};
                                if (data.orgUnit){
                                    condition['orgUnit.name']= data.branch;
                                }

                                Asset.findOne(condition, {}, {sort:{seqId:1}}, (err, record)=>{
                                    if (err){
                                        return next5(err);
                                    }
                                    if (!record){
                                        return next5('draft assets not found!');
                                    }
                                    asset = record;
                                    return next5();
                                });
                            };
                            const isNumber= (value)=>{
                                return typeof value === 'number' && isFinite(value);
                            }

                            Async.series([loadExisting, loadDraft], (err)=>{
                                if (err){
                                    return next2(err);
                                }
                                if (!asset){
                                    return next2('Asset not found!');
                                }
                                if (!productModel){
                                    return next2();
                                }
                                let record= asset;
                                if (data.purchaseCost){
                                    try {
                                        data.purchaseCost= parseFloat(data.purchaseCost.replace(/[,:/]/g, ''));
                                    }
                                    catch(e) {
                                        delete data.purchaseCost;
                                    }
                                    if (!isNumber(data.purchaseCost)){
                                        delete data.purchaseCost;
                                    }
                                }
                                if (data.isCritical){
                                    data.isCritical= (data.isCritical.toLowerCase() === 'c')? true: false;
                                }
                                let fields= ['serialNumber', 'secondaryCode', 'installedOn'];
                                fields.forEach((field)=>{
                                    record[field]= data[field];
                                });
                                if (productModel){
                                    record.model= {
                                        ...productModel.getShortForm(),
                                        product: {...productModel.product}
                                    };
                                    console.log('product', record.model.product);
                                    record.markModified('model');
                                }
                                if (customer){
                                    record.customer = customer.getShortForm();
                                    record.markModified('customer');
                                }
                                // if (site){
                                //     record.site = site.getShortForm();
                                //     record.markModified('site');
                                // }
                                record.isInstalled = true;
                                if (data.locatedAt){
                                    record.locatedAt= data.locatedAt;
                                }
                                if (data.address){
                                    record.address= data.address;
                                    record.markModified('address');
                                }
                                else if (customer){
                                    record.address= customer.address;
                                    record.markModified('address');
                                    if (customer.technician){
                                        record.technician= {...customer.technician};
                                        record.markModified('technician');
                                    }
                                }
                                if (!record.secondaryCode){
                                    record.set('secondaryCode', undefined);
                                }
                                if (technician){
                                    record.technician= technician.getShortForm();
                                    record.markModified('technician');
                                }
                                if (contract){
                                    record.contract= contract.getShortForm();
                                    record.markModified('contract');
                                }
                                contractAssets.push(record.getShortForm());
                                record.save((err)=>{
                                    if (!stats.customerWise[customer.name]) {
                                        stats.customerWise[customer.name] = 0;
                                    }
                                    stats.customerWise[customer.name]++;
                                    if (!stats.modelWise[productModel.name]){
                                        stats.modelWise[productModel.name]= 0;
                                    }
                                    stats.modelWise[productModel.name]++;
                                    next4(err);
                                });
                            });
                        };
                        Async.eachSeries(assets, mapAsset, next3);
                    };

                    const updateContractCustomerAndAssets= (next3) =>{
                        if (contractNumber === 'NA'){
                            return next3();
                        }
                        if (!customer){
                            return next3();
                        }
                        if (!contract){
                            return next3();
                        }
                        contract.customer= customer.getShortForm();
                        contract.markModified('customer');
                        Asset.find({'contract._id': contract._id}, (err, allContractAssets)=>{
                            contract.numAssets= allContractAssets.length;
                            contract.assets= [];
                            allContractAssets.forEach((c)=>{
                                contract.assets.push(c.getShortForm());
                            });
                            contract.markModified('assets');
                            contract.numAssets= allContractAssets.length;
                            if (productModel){
                                contract.model= {...productModel.getShortForm(), meterTypes: productModel.meterTypes};
                                contract.markModified('model');
                                contract.product= {...productModel.product};
                                contract.markModified('product');
                            }
                            stats.contractWise[contract.code]= contract.numAssets;
                            contract.save(next3);
                        });
                    };

                    Async.series([mapContractAssets, updateContractCustomerAndAssets], next2)
                }

                Async.eachSeries(Object.keys(contractWiseAssets), mapContractWiseAssets, next);
            };

            let steps= [
                loadCustomers,
                loadContracts,
                loadTechnicians,
                loadOrgUnits,
                loadProducts,
                loadModels,
                loadMeterTypes,
                groupByContract,
                mapAssets
            ];

            Async.series(steps, (err)=>{
                if (err){
                    console.log(err);
                }
                console.log([['Total', stats.total], ['Skipped', stats.skipped]]);
                console.log('Total skipped', );
                console.log(skippedAssets);
                Utils.write2File('assetload_error.log', skippedAssets, doneCb);
            });
        });
}
