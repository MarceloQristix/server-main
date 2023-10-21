
const Async = require('async');
const Moment = require('moment');

module.exports = function (app, doneCb){
    console.log("About to load SKUs !!");

    const SKU= app.locals.models.SKU;

    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    const csv= require('csvtojson')
    csv()
        .fromFile(csvFilePath)
        .then((jsonObj)=>{
            // console.log(jsonObj);

            let total= jsonObj.length;
            let index= 0;

            const loadRecord = (data, next)=>{
                data.name= (data.name||'').trim();
                data.brand= (data.brand||'').trim();
                let prevSecondaryCode;
                if (!data.brand){   //tkm
                    let fileds2Join4Name= [data.variant, data.attrs.color, data.attrs.transmission, data.attrs.fuelType ];
                    prevSecondaryCode= fileds2Join4Name.join('-');
                    if (data.variant.toLowerCase().indexOf(data.model.toLowerCase()) === -1){
                        fileds2Join4Name.unshift(data.model);
                    }
                    data.name= fileds2Join4Name.join('-')
                }
                if (!data.name){    //skip empty
                    return next();
                }
                if (data.primaryImage){
                    let parts= data.primaryImage.split('/');
                    let encodedPaths= [];
                    parts.forEach((part)=>{
                        encodedPaths.push(escape(part));
                    });
                    data.primaryImage= '/images/app-images/tkm/'+encodedPaths.join('/');
                }
                let record;
                index++;
                console.log('processing '+index + ' of '+total);
                const loadOrCreateRecord= (next2) =>{
                    let secondaryCode= '';
                    if (data.brand){    //ttk
                        secondaryCode= [data.name, data.brand].join(' - ');
                    }
                    else {  //tkm
                        secondaryCode= data.name;
                    }
                    data.secondaryCode= secondaryCode;
                    SKU.findOne({secondaryCode: {$in: [secondaryCode, prevSecondaryCode]}}, (err, existing)=>{
                        if (existing){
                            console.log('record already exists!');
                            for (let key in data){
                                existing[key]= data[key];
                            }
                            existing.save(next2);
                            return;
                        }
                        record= new SKU({
                            ...data,
                            createdBy:by
                        });
                        record.save(next2);
                    });
                };

                Async.series([loadOrCreateRecord], (err)=>{
                    if (err){
                        console.log('processing completed with error for '+index + ' of '+total);
                        return next(err);
                    }
                    console.log('processing completed successfully for '+index + ' of '+total);
                    return next();
                });
            };
            Async.eachSeries(jsonObj, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
