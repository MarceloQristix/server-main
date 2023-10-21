
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('created/lastModified fix!', new Date());

    const OrgUser= app.locals.models.OrgUser;
    let globalUserIds= [];
    let global2LocalUserIdMap= {};
    let allNonVirtualUsers= [];

    const loadOrgUsers= (next)=>{
        OrgUser.find({isVirtual: {$ne:true}}, (err, records)=>{
            if (err){
                return next(err);
            }
            records.forEach((record)=>{
                globalUserIds.push(record.globalUser._id);
                global2LocalUserIdMap[record.globalUser._id.toString()]= record._id;
            });
            allNonVirtualUsers= records;
            return next();
        });
    };

    const updateCreatedBy= (next)=>{
        const updateCreatedBy4User= (user, next2)=>{
            let localUserId= global2LocalUserIdMap[user.createdBy];
            if (!localUserId){
                return next2();
            }
            user.createdBy= localUserId;
            user.save(next2);
        };
        Async.eachSeries(allNonVirtualUsers, updateCreatedBy4User, next);
    };

    Async.series([loadOrgUsers, updateCreatedBy], doneCb);
}
