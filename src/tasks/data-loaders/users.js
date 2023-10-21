
const Async = require('async');
const CSV= require('csvtojson')
const Utils= require('./utils');

module.exports = function (app, doneCb){
    console.log("About to execute load users !!");
    const OrgUser= app.locals.models.OrgUser;

    const dataDef= Utils.processDataDef('users')
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
            //sort rows by role
            let roleValue= {
                technician: 1,
                manager:4,
                business_head:5
            }
            let sortedRows= rows.sort((a, b)=>{
                return roleValue[b.role]- roleValue[a.role];
            });

            let userMap= {};
            const loadRecord = (data, next)=>{
                data.firstName= data.globalUser.firstName;
                data.lastName= data.globalUser.lastName;
                data.globalUser.name= [data.globalUser.firstName, data.globalUser.lastName].join(' ');
                if (!data.globalUser.name){    //skip empty
                    console.log('skipping empty!');
                    return next();
                }
                if (data.globalUser.uniqueId){  //in this case uniqueId is email
                    if (!data.globalUser.contact){
                        data.globalUser.contact= {};
                    }
                    data.globalUser.contact.email= data.globalUser.uniqueId;
                }
                if (data.reportsTo && userMap[data.reportsTo]){
                    data.reportsTo= userMap[data.reportsTo]._id;
                }
                let user;
                const upsertUser= (next2) =>{
                    OrgUser.findOne({name:data.name}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record){
                            OrgUser.doUpdate(by, record._id, data, (err, doc)=>{
                                if (err){
                                    return next2(err);
                                }
                                user= doc;
                                userMap[user.name]= user;
                                return next2();
                            });
                        }
                        else {
                            OrgUser.doCreate(by, data,  (err, doc)=>{
                                if (err){
                                    return next2(err);
                                }
                                user= doc;
                                userMap[user.name]= user;
                                return next2();
                            });
                        }
                    });
                };
                Async.series([upsertUser], next);
            };
            Async.eachSeries(sortedRows, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });

        });
}
