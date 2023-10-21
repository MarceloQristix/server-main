
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
            const populateInstallationDate= (data, next) =>{
                let primaryIdentifier= 'serialNumber';
                let condition= {};
                condition[primaryIdentifier]= data[primaryIdentifier];
                Asset.findOne(condition, (err, record) => {
                    if (err) {
                        return next(err);
                    }
                    if (!record){
                        add2Skipped(data[primaryIdentifier], data,'asset not found');
                        return next();
                    }
                    if (!data.installedOn) {
                        add2Skipped(data[primaryIdentifier], data,'installedOn not set');
                        return next();
                    }
                    record.installedOn= data.installedOn;
                    record.isInstalled= true;
                    return record.save(next);
                });
            }

            Async.eachSeries(rows, populateInstallationDate, (err)=>{
                if (err){
                    console.log(err);
                }
                console.log([['Total', stats.total], ['Skipped', stats.skipped]]);
                console.log('Total skipped', );
                console.log(skippedAssets);
                // Utils.write2File('assetload_error.log', skippedAssets, doneCb);
            });
        });
}
