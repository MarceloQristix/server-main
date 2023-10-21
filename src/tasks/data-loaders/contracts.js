const Moment= require('moment')
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

module.exports = function (app, doneCb){
    console.log("About to execute load contracts !!");
    const Contract= app.locals.models.Contract;

    const dataDef= Utils.processDataDef('contracts')
    let by = app.locals.admin._id;
    let skippedContracts= [];
    let stats= {
        total: 0,
        created: 0,
        updated: 0,
        affected: 0,
        skipped: 0
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
            const loadRecord = (data, next)=>{
                stats.total++;
                if (!data.endDate){
                    data.endDate= Moment().add(1, 'year').endOf('year');    //specific hack for abudhabi
                }
                if (!data.code||!data.endDate|| !data.startDate){    //skip empty
                    stats.skipped++;
                    skippedContracts.push(data.code);
                    return next();
                }
                let contract;
                const upsertContract= (next2) =>{
                    let cond= {code: data.code};
                    data.name= data.cType;  //name and contract type are same
                    data.duration= Moment(data.endDate).diff(Moment(data.startDate), "days");
                    data.seqId= parseInt(data.code.replace('CON',''));
                    data.sla= {
                        tat: 24,
                        responseTime: 24,
                        pm: {
                            frequency: 5,
                            startsAfter: 48,
                            interval:100
                        }
                    }
                    data.charges= {
                        planType: 'fixed',
                        amount: 0,
                    }
                    Contract.findOne(cond, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record) {
                            stats.updated++;
                            contract= record;
                        }
                        else {
                            stats.created++;
                            contract= new Contract({
                                createdBy:by
                            });
                        }
                        stats.affected++;
                        for (let key in data){
                            contract.set(key, data[key]);
                            contract.markModified(key);
                        }
                        contract.lastModifiedBy= by;
                        contract.save(next2);
                    });
                };
                Async.series([upsertContract], next);
            };
            Async.eachSeries(rows, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                console.dir(skippedContracts, {'maxArrayLength': null});
                console.log('contracts skipped:', skippedContracts.length);
                console.log(stats);
                return doneCb(err);
            });
        });
}
