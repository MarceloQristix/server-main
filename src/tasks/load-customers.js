
const Async = require('async');
const Moment = require('moment');

module.exports = function (app, doneCb){
    console.log("About to execute load customers!!");
    const Customer= app.locals.models.Customer;

    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    const csv= require('csvtojson')
    csv()
        .fromFile(csvFilePath)
        .then((jsonObj)=>{
            console.log(jsonObj);

            const loadRecord = (data, next)=>{
                if (!data.name){    //skip empty
                    return next();
                }
                let customer;
                const loadOrCreateCustomer= (next2) =>{
                    customer= new Customer({
                        ...data,
                        custType: 'business',
                        createdBy:by
                    });
                    customer.save(next2);
                };

                Async.series([loadOrCreateCustomer], next);
            };
            Async.eachSeries(jsonObj, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
