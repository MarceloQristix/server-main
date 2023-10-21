
const Async = require('async');
const Moment = require('moment');
const Mongoose = require('mongoose');

module.exports = function (app, doneCb){
    console.log("About to execute load-assets-customers!!");
    const Asset = app.locals.models.Asset;
    const Ticket= app.locals.models.Ticket;
    const primaryIdentifier= app.locals.Settings.asset.primaryIdentifier || 'serialNumber';

    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    const csv= require('csvtojson')
    csv()
        .fromFile(csvFilePath)
        .then((jsonObj)=>{

            const loadRecord = (data, next)=>{
                if (!data[primaryIdentifier]){    //skip empty
                    return next();
                }
                console.log('>>>>>>>>>>>>>', data.rowNumber);

                let asset;
                const loadAsset = (next2) =>{
                    let condition= { };
                    condition[primaryIdentifier]= data[primaryIdentifier];

                    Asset.findOne(condition, (err, doc)=>{
                        if(err) {
                            return next2(err);
                        }
                        if (!doc){
                            console.log('asset not found')
                            return next2();
                        }
                        asset= doc;
                        return next2();
                    });
                };

                let pmTicket;
                const loadPMTicket= (next2) =>{
                    if (!asset){
                        return next2();
                    }
                    let condition= {
                        'asset._id': asset._id, sType:'pm',
                        status:{$ne:'05_closed'}
                    };
                    Ticket.findOne(condition, (err, doc)=>{
                        if (err){
                            return next2(err);
                        }
                        if (!doc){
                            console.log('pm ticket not found for ', asset[primaryIdentifier]);
                            return next2();
                        }
                        pmTicket= doc;
                        return next2();
                    });
                }

                const updatePMTicketDueDate= (next2) =>{
                    if (!pmTicket){
                        return next2();
                    }
                    if (!data.secondPMDueDate){
                        return next2();
                    }
                    pmTicket.dueDate= Moment(data.secondPMDueDate, 'DD/MM/YYYY').toDate();
                    pmTicket.save(next2);
                };

                Async.series([
                    loadAsset,
                    loadPMTicket,
                    updatePMTicketDueDate,
                ], next);
            };
            Async.eachSeries(jsonObj, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
