
const Async = require('async');
const Moment = require('moment');

module.exports = function (app, doneCb){
    console.log("About to load TKM Dealers !!");

    const OrgUnit= app.locals.models.OrgUnit;

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
                index++;
                console.log('processing '+index + ' of '+total);
                for (let key in data){
                    data[key]= data[key]?(data[key]+'').trim():'';
                }
                let {name, address, city, state}= data;
                if (!name || !address){    //skip empty
                    return next();
                }
                let parts= name.split('-');
                let dealerCode= parts[1].trim();
                OrgUnit.findOne({code:dealerCode}, (err, record)=>{
                    if(err){
                        return next(err);
                    }
                    if (!record){
                        console.log(`Dealership ${name} not found!`);
                        return next();
                    }
                    let addressParts= address.split(',');
                    let area;
                    let addrLine1= addressParts.slice(1).join(',');
                    record.address= {
                        addrLine1,
                        state,
                        city
                    };
                    record.markModified('address');
                    record.save(next);
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
