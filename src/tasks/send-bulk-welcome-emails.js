
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Sending welcome emails to users!', new Date());

    const OrgUser= app.locals.models.OrgUser;
    let cond= {role: 'dealer'};
    let userIds= [];
    let by = app.locals.admin._id;

    const loadOrgUsers= (next)=>{
        OrgUser.distinct('_id', cond, (err, ids)=>{
            userIds= ids;
            next(err);
        });

    };
    const sendWelcomeEmail= (next)=>{
        let index=0;
        let total= userIds.length;
        const sendWelcomeEmail2User= (userId, next2)=>{
            index++;
            console.log(`sending ${index+1} of ${total}`);
            OrgUser.sendWelcomeEmail(by, userId, {}, (err)=>{
                console.log(err);
                return next2();
            });
        };
        Async.eachSeries(userIds,sendWelcomeEmail2User, next);
    };

    Async.series([loadOrgUsers, sendWelcomeEmail], doneCb);
}
