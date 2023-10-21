
const Async = require('async');
const Moment = require('moment');

module.exports = function (app, doneCb){
    console.log("About to execute load Spares , Consumables, Accessories !!");

    const Accessory= app.locals.models.Accessory;
    const SparePart= app.locals.models.SparePart;
    const Consumable= app.locals.models.Consumable;

    const ModelMap = {
        spare: SparePart,
        consumable: Consumable,
        accessory: Accessory
    }

    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    const csv= require('csvtojson')
    csv()
        .fromFile(csvFilePath)
        .then((jsonObj)=>{
            // console.log(jsonObj);

            const loadRecord = (data, next)=>{
                if (!data.name){    //skip empty
                    return next();
                }
                let record;
                let Model = ModelMap[data.type];
                if (!Model){
                    console.log('Model not found!!', data.type);
                    return next();
                }

                const loadOrCreateRecord= (next2) =>{
                    Model.findOne({name:data.name}, (err, existing)=>{
                        if (existing){
                            console.log('record already exists!');
                            for (let key in data){
                                existing[key]= data[key];
                            }
                            existing.save(next2);
                            return;
                        }
                        record= new Model({
                            ...data,
                            createdBy:by
                        });
                        record.save(next2);
                    });
                };

                Async.series([loadOrCreateRecord], next);
            };
            Async.eachSeries(jsonObj, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
