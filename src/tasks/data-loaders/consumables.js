
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

module.exports = function (app, doneCb){
    console.log("About to execute load Consumables !!");
    const Consumable= app.locals.models.Consumable;

    const dataDef= Utils.processDataDef('consumables')
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
                let consumable;
                if (data.yield){
                    let yparts= data.yield.split(' ');
                    data.attrs= {
                        yield: Number(yparts[0])
                    }
                }
                console.log(data);
                const updateConsumable= (next2) =>{
                    Consumable.findOne({code:data.code}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record) {
                            consumable= record;
                        }
                        else {
                            consumable= new Consumable({
                                createdBy:by
                            });
                        }
                        for (let key in data){
                            consumable.set(key, data[key]);
                            consumable.markModified(key);
                        }
                        console.log(data.attrs);
                        consumable.lastModifiedBy= by;
                        consumable.save(next2);
                    });
                };
                Async.series([updateConsumable], next);
            };
            Async.eachSeries(rows, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
