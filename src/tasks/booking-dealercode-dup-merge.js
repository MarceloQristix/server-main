
const Async = require('async');
const {toDate} = require('../lib/DateUtils');

module.exports = function (app, doneCb){
    console.log('Merge same bookings with dealer code repetition serial Number !', new Date());

    const Asset= app.locals.models.Asset;
    const OrgUnit= app.locals.models.OrgUnit;
    let tobeUpdated= [];
    let tobeCleared= [];
    let tobeUpdatedDealerCodes= {};
    let tobeClearedDealerCodes= {};
    let withoutSerialNumber= [];
    let dups= [];
    let allMap= {};
    let dealersWithdups= {};
    let groupDealersWithDups= {};
    let extentOfDuplicacy= {};
    const orgUnitMap= {};

    const loadOrgUnits= (next)=>{
        OrgUnit.find({orgUnitType:'dealership'}, (err, records)=>{
            if(err){
                return next(err);
            }
            records.forEach((record)=>{
                orgUnitMap[record.code]= record;
            });
            return next();
        });
    };

    const loadAssetIds= (next) =>{
        let cond= {
            status:{$nin:['01_draft']},
            'orgUnit._id': {$exists:true},
            serialNumber: {$exists: true}
        }
        Asset.find(cond,{ _id:1, serialNumber:1, orgUnit:1}, (err, records)=>{
            if (err){
                return doneCb(err);
            }
            let index=0;
            let total= records.length;
            let dupIds= [];
            const checkDupSerialNumber= (asset, next2) =>{
                index++;
                let serialNumber= asset.serialNumber;
                if (!serialNumber){
                    withoutSerialNumber.push(asset._id);
                    return next2();
                }
                let parts= serialNumber.trim().split('ORD');
                let dealerCodePart= parts[0];
                if (dealerCodePart.length > 6){
                    dupIds.push(asset._id);
                    dups.push({
                        asset,
                        serialNumber,
                        orderNumberPart: parts[1],
                        originalOrderNumber: dealerCodePart.substring(0,5)+'ORD'+parts[1],
                        dealerCodePart
                    });
                    if (!extentOfDuplicacy[dealerCodePart.length]){
                        extentOfDuplicacy[dealerCodePart.length]= {
                            dealerCodes: {}
                        };
                    }
                    extentOfDuplicacy[dealerCodePart.length].dealerCodes[dealerCodePart]= true;
                    let orgUnit= orgUnitMap[asset.orgUnit.code];
                    if (!dealersWithdups[orgUnit.code]){
                        dealersWithdups[orgUnit.code]= {
                            count: 0,
                            sample: ''
                        };
                    }
                    if (!groupDealersWithDups[orgUnit.parent.code]){
                        groupDealersWithDups[orgUnit.parent.code]= {
                            count: 0,
                            sample: ''
                        };
                    }
                    dealersWithdups[orgUnit?.code].count++;
                    dealersWithdups[orgUnit?.code].sample= dealerCodePart;
                    groupDealersWithDups[orgUnit.parent.code].count++;
                    groupDealersWithDups[orgUnit.parent.code].sample= dealerCodePart;
                }
                return next2();
            }
            Async.eachSeries(records, checkDupSerialNumber, (err)=>{
                let canbeCorrected= [];
                const checkOriginal= (data, next2) =>{
                    Asset.findOne({serialNumber: data.originalOrderNumber}, (err, record)=>{
                        if(err){
                            return next2(err);
                        }
                        if (!record){
                            canbeCorrected.push(data);
                            data.asset.serialNumber= data.originalOrderNumber;
                            data.asset.save(next2);
                            return;
                        }
                        data.asset.isDeleted= true;
                        data.asset.save(next2);
                        return;
                    });
                };

                Async.eachSeries(dups, checkOriginal, (err)=>{
                    console.log('dups:', dups.length);
                    console.log('can be corrected:', canbeCorrected.length);
                    console.log(dealersWithdups);
                    console.log(groupDealersWithDups);
                    // console.log(extentOfDuplicacy);
                    next(err);
                });
            });
        });
    }

    const steps=[
        loadOrgUnits,
        loadAssetIds,
    ]

    Async.series(steps, doneCb);

}
