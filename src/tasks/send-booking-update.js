
const Async = require('async');

module.exports = function (app, doneCb){

    let groupDealershipCode= 'QM005';

    const OrgUnit= app.locals.models.OrgUnit;
    const Asset= app.locals.models.Asset;

    console.log('Sending updates to group dealership bookings for', groupDealershipCode);
    let total= 0, counter=0;

    let groupDealership;
    let dealerships= [];
    let by = app.locals.admin;

    const loadGroupDealership= (next) =>{
        OrgUnit.findOne({code: groupDealershipCode}, (err, record)=>{
            groupDealership= record;
            if (!groupDealership.custom?.apiKey){
                return next('api key not configured');
            }
            if (!groupDealership.custom?.feedbackUrl){
                return next('feedback url not configured');
            }
            return next();
        });
    };

    const loadDealerships= (next)=>{
        OrgUnit.find({'parent._id': groupDealership._id}, (err, records)=>{
            dealerships= records;
            return next();
        });
    };

    const sendUpdates= (next)=>{
        const sendDealershipWiseUpdates= (dealership, next2)=>{
            console.log(`About to send updates for ${dealership.name} : ${dealership.code}`);
            Asset.find({'orgUnit._id': dealership._id, isLatestStatusUpdateTriggered: {$ne:true}}, (err, records)=>{
                let index= 0;
                const sendUpdate= (asset, next3)=>{
                    if (!asset.custom){
                        console.log('Skipping booking update sending for ', asset.code, 'due to data missing');
                        return next3();
                    }
                    counter++;
                    index++;
                    asset.sendStatusUpdate2Customer(by, {}, next3);
                };

                Async.eachSeries(records, sendUpdate, (err)=>{
                    total+= index;
                    console.log(`Sent updates for ${dealership.name} : ${dealership.code}`);
                    next2(err);
                });
            });
        };
        Async.eachSeries(dealerships, sendDealershipWiseUpdates, next);
    };

    Async.series([loadGroupDealership, loadDealerships, sendUpdates], (err)=>{
        if (err){
            console.error(`There is an error while sending comm to ${groupDealership.name}`, err);
        }
        console.log(`Sent Updates ${counter} of ${total} for Group dealership ${groupDealership.name}`);
        doneCb(err);
    });
}
