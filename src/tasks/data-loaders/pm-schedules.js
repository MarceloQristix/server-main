
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

module.exports = function (app, doneCb){
    console.log("About to execute load pm-schedules !!");
    const Ticket= app.locals.models.Ticket;
    const Contract= app.locals.models.Contract;
    const Asset= app.locals.models.Asset;

    const DataDef= Utils.processDataDef('pm-schedules')
    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    let skipped= [];
    CSV({colParser: DataDef.colParser})
        .fromFile(csvFilePath)
        .preFileLine((fileLineString, lineIdx)=>{
            if (lineIdx === 0){
                let columns= fileLineString.split(',');
                let header= [];
                for (let index=0; index< columns.length; index++){
                    let columnId= Utils.normalizeString(Utils.stripComments(columns[index]));
                    if (DataDef.fieldMap[columnId]){
                        header.push(DataDef.fieldMap[columnId].id);
                    }
                    else {
                        header.push('');
                    }
                }
                return header.join(',');
            }
            return fileLineString;
        })
        .then((jsonObj)=>{
            const loadRecord = (data, next)=>{
                if (!data.serialNumber){    //skip empty
                    console.log('ERROR');
                    return next();
                }
                let asset;
                const loadAsset= (next2) =>{
                    let cond= [
                        {secondaryCode: data.serialNumber},
                        {serialNumber: data.serialNumber}
                    ]
                    Asset.findOne({$or:cond}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (!record){
                            skipped.push(data.serialNumber);
                            console.log('Asset not found!', data.serialNumber);
                            return next2 ();
                        }
                        asset= record;
                        return next2();
                    });
                };

                const loadOrCreatePMTicket= (next2) =>{
                    if (!asset){
                        return next2();
                    }
                    Ticket.findOne({'asset._id': asset._id, sType: 'pm', dueDate: data.scheduledOn}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record){
                            return next2();
                        }
                        let pmTicketData= {
                            sType: 'pm',
                            name: data.name,
                            asset,
                            dueDate: data.scheduledOn,
                            source: 'system_generated'
                        };
                        Ticket.create({id:by.toString()},pmTicketData, next2);
                    });
                };
                Async.series([loadAsset, loadOrCreatePMTicket], next);
            };
            Async.eachSeries(jsonObj, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                console.log(skipped)
                console.log('skipped',skipped.length);
                return doneCb(err);
            });
        });
}
