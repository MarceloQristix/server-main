
const Async= require('async');
const {next} = require("lodash/seq");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);
    const ReportsDef = require('../../config/core/reports');

    class OrgUnitProfile extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'org-unit-profile'].join('/'), app.locals.models.OrgUnit, true);
            this.router.get('/', this.getProfile.bind(this));
            this.router.get('/:id', this.getProfile.bind(this));
            this.router.put('/:id', this.updateSettings.bind(this));
            this.router.put('/:id/testBookingUpdateSMS', this.testBookingUpdateSMS.bind(this));
            app.use(this.basePath, this.router);
        }

        testBookingUpdateSMS(req, res){
            const mainApp = app.locals.mainApp;
            const OrgUser= app.locals.models.OrgUser;
            let id = req.params.id;
            let by= req.orgMe||req.user;
            let {testMobileNumber}= req.body;
            let orgUnitId;
            let orgUnit;
            let name= 'Test Customer';
            // if (id !== 'self') {
            //     return this.sendUpdateResponse(req, res, 'not accessible!');
            // }
            const loadUser= (next)=>{
                if (id !== 'self'){
                    orgUnitId= id;
                    return next();
                }
                OrgUser.findById(by.id||by._id, (err, userRecord)=>{
                    if (err){
                        return next(err);
                    }
                    if(!userRecord){
                        return  next('user not found!');
                    }
                    orgUnitId= userRecord?.orgUnit?._id;
                    name= userRecord.globalUser.name||userRecord.globalUser.firstName;
                    if (!orgUnitId){
                        return next('entity not mapped to this user!');
                    }
                    return next();
                });
            }

            const loadOrgUnit= (next)=>{
                this.model.findById(orgUnitId, (err, record)=>{
                    if (err){
                        return next(err);
                    }
                    if (!record){
                        return next('orgunit not found!');
                    }
                    if(record.orgUnitType === 'groupDealership'){
                        orgUnit= record;
                        return next();
                    }
                    if(!record.parent?._id){
                        return next('could not get group dealership mapping');
                    }
                    this.model.findById(record.parent._id, (err, record)=>{
                        if (err){
                            return next(err);
                        }
                        if (!record){
                            return next('orgunit not found!');
                        }
                        if(record.orgUnitType === 'groupDealership'){
                            orgUnit= record;
                            return next();
                        }
                        return next('could not get group dealership mapping');
                    });
                });
            }

            const sendTestSMS= (next)=>{
                let template= orgUnit.custom.smsTemplates.bookingStatusUpdate;
                let data= {
                    arr:[
                        'Mr '+name,
                        'TEST123456789 for Innova Hycross'
                    ]
                };
                mainApp.locals.services.SMS.send(testMobileNumber, template, data, (err)=>{
                    return next(err);
                }, {useSubAccount: true, config:{apiKey: orgUnit.custom.apiKey, senderId: orgUnit.custom.senderId}});
            };

            let numUpdates= 0;
            let dealershipIds= [];

            const loadDealerships= (next)=>{
                this.model.distinct('_id', {'parent._id': orgUnit._id}, (err, ids)=>{
                    dealershipIds= ids;
                    return next(err);
                });
            };

            const getCountOfUpdates= (next)=> {
                const Asset = app.locals.models.Asset;
                Asset.countDocuments({
                    'orgUnit._id': {$in:dealershipIds},
                    isLatestStatusUpdateTriggered: {$ne: true}
                }, (err, count) => {
                    numUpdates= count;
                    return next(err);
                });
            };

            Async.series([loadUser, loadOrgUnit, sendTestSMS, loadDealerships, getCountOfUpdates], (err)=>{
                this.sendUpdateResponse(req, res, err, {numUpdates});
            });
        }

        updateSettings(req, res) {
            const OrgUser= app.locals.models.OrgUser;
            let id = req.params.id;
            let by= req.orgMe||req.user;
            // if (id !== 'self') {
            //     return this.sendUpdateResponse(req, res, 'not accessible!');
            // }
            const Settings= app.locals.Settings.orgUnitProfile;
            if (Settings.isGlobal){
                this.model.getRoot((err, record)=>{
                    this.model.updateSettings(by, record._id, req.body, this.sendUpdateResponse.bind(this, req, res));
                });
                return;
            }
            OrgUser.findById(by.id||by._id, (err, userRecord)=>{
                if (err){
                    return this.sendUpdateResponse(req, res, err);
                }
                if(!userRecord){
                    return  this.sendUpdateResponse(req, res, 'user not found');
                }
                let orgUnitId= userRecord?.orgUnit?._id;
                if (!orgUnitId){
                    return this.sendUpdateResponse(req, res, 'entity not mapped to this user!');
                }
                this.model.updateSettings(by, orgUnitId, req.body, this.sendUpdateResponse.bind(this, req, res));
            });
        }

        getProfile(req, res) {
            const OrgUser= app.locals.models.OrgUser;
            let id = req.params.id;
            let by= req.orgMe||req.user;
            // if (id !== 'self') {
            //     return this.sendUpdateResponse(req, res, 'not accessible!');
            // }
            const Settings= app.locals.Settings.orgUnitProfile;
            if (Settings.isGlobal){
                this.model.getRoot((err, record)=>{
                    return this.sendUpdateResponse(req, res, err, record);
                });
                return;
            }
            OrgUser.findById(by.id||by._id, (err, userRecord)=>{
                if (err){
                    return this.sendUpdateResponse(req, res, err);
                }
                if(!userRecord){
                    return  this.sendUpdateResponse(req, res, 'user not found');
                }
                let orgUnitId= userRecord?.orgUnit?._id;
                if (!orgUnitId){
                    return this.sendUpdateResponse(req, res, 'entity not mapped to this user!');
                }
                this.model.findById(orgUnitId, (err, record)=>{
                    return this.sendUpdateResponse(req, res, err, record);
                });
            });
        }

    }

    return OrgUnitProfile;
};
