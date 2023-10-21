
const Async = require('async');
const DLUtils = require("../data-loaders/utils");
const {default: XSLX} = require("node-xlsx");
const ObjectPath = require("object-path");

module.exports = function (app){
    const OrgUnit= app.locals.models.OrgUnit;
    const Enquiry= app.locals.models.Enquiry;
    const Notification= app.locals.models.Notification;

    const dryRun = (by, currTask, cb) => {
        //TODO: Add validations like whether settings are enabled etc here.
        currTask.initRun((err)=>{
            let alreadySent4EnquiryIds= [];
            let enquiryIds= [];
            let campaign= currTask.data.campaign;

            const loadEnquiryIds4WhichCampaignIsAlreadySent= (next)=>{
                Notification.distinct('enquiryId',{entityType: 'campaign', 'entity._id': campaign._id}, (err, ids)=>{
                    if (err){
                        return next(err);
                    }
                    alreadySent4EnquiryIds= ids;
                    return next();
                });
            }
            const loadEnquiryIds= (next)=>{
                Enquiry.distinct('_id', {_id: {$nin:alreadySent4EnquiryIds}}, (err, ids)=>{
                    enquiryIds= ids;
                    return next();
                });
            };

            Async.series([loadEnquiryIds4WhichCampaignIsAlreadySent, loadEnquiryIds], (err)=>{
                currTask.data.enquiryIds= enquiryIds;
                currTask.markModified('data');
                currTask.finishRun(err, cb, enquiryIds.length, enquiryIds.length);
            });
        });
    };

    const commit = (by, currTask, cb) => {

        let total= 0, counter=0;
        let groupDealership;
        let dealerships= [];

        const loadGroupDealership= (next) =>{
            // let cond= {code: groupDealershipCode};
            if (!currTask.orgUnit?._id){
                return next('groupdealership not mapped in the task')
            }
            OrgUnit.findOne(currTask.orgUnit._id, (err, record)=>{
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
        let skipped=0;
        let sent=0;


        const sendUpdates= (next)=>{
            const sendDealershipWiseUpdates= (dealership, next2)=>{
                console.log(`About to send updates for ${dealership.name} : ${dealership.code}`);
                Asset.find({'orgUnit._id': dealership._id, isLatestStatusUpdateTriggered: {$ne:true}}, (err, records)=>{
                    let index= 0;
                    const sendUpdate= (asset, next3)=>{
                        index++;
                        skipped++;
                        if (!asset.custom){
                            console.log('Skipping booking update sending for ', asset.code, 'due to data missing');
                            return next3();
                        }
                        counter++;
                        sent++;
                        if ((sent % 10 === 0) || (sent === total)) {
                            currTask.updateProgress(sent, ()=>{});
                        }
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

        currTask.initRun(()=>{
            currTask.setSubStatus('saving', total, (err) => {
                Async.series([loadGroupDealership, loadDealerships, sendUpdates], (err)=>{
                    if (err){
                        console.error(`There is an error while sending comm to ${groupDealership.name}`, err);
                    }
                    console.log(`Sent Updates ${counter} of ${total} for Group dealership ${groupDealership.name}`);
                    currTask.finishRun(err, cb, total, sent);
                });
            });
        });
    }

    return {dryRun, commit}
}
