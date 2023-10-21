const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

module.exports = function (app, doneCb){
    console.log("About to execute load customers !!");
    const Customer= app.locals.models.Customer;

    const dataDef= Utils.processDataDef('customers')
    let by = app.locals.admin._id;
    let stats= {
        rows: 0,
        loaded: 0,
        skipped: 0
    };
    let skippedRows= [];

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
                stats.rows++;
                let {uniqueIdentifierKey}= dataDef;
                let uniqueId = data[uniqueIdentifierKey];
                if (!data.name || !uniqueId){    //skip empty
                    stats.skipped++;
                    skippedRows.push(stats.rows);
                    return next();
                }
                stats.loaded++;
                let customer;
                const upsertCustomer= (next2) =>{
                    let cond= {};
                    cond[uniqueIdentifierKey]= uniqueId;
                    Customer.findOne(cond, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record) {
                            customer= record;
                        }
                        else {
                            customer= new Customer({
                                custType: 'business',
                                createdBy:by
                            });
                        }
                        for (let key in data){
                            customer.set(key, data[key]);
                            customer.markModified(key);
                        }
                        customer.lastModifiedBy= by;
                        customer.save(next2);
                    });
                };
                Async.series([upsertCustomer], next);
            };
            Async.eachSeries(rows, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                console.log(skippedRows);
                console.log(stats);
                return doneCb(err);
            });
        });
}
