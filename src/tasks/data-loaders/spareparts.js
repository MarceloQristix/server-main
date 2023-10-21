
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

module.exports = function (app, doneCb){
    console.log("About to execute load Spare parts !!");
    const SparePart= app.locals.models.SparePart;

    const dataDef= Utils.processDataDef('spareparts')
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
                if (!data.code){    //skip empty
                    console.log('Skipping empty');
                    return next();
                }
                let spare;
                const updateSpare= (next2) =>{
                    SparePart.findOne({code:data.code}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record) {
                            spare= record;
                        }
                        else {
                            spare= new SparePart({
                                createdBy:by
                            });
                        }
                        for (let key in data){
                            spare.set(key, data[key]);
                            spare.markModified(key);
                        }
                        spare.lastModifiedBy= by;
                        spare.save(next2);
                    });
                };
                Async.series([updateSpare], next);
            };
            Async.eachSeries(rows, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
