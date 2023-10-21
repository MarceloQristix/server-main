const Async = require('async');
const {next} = require("lodash/seq");
const {getDataScopeAccessConditions} = require("../../models/utils");
const Moment = require("moment/moment");
const K = require("../../K");
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Enquiry extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'enquiry'].join('/');
            super(basePath, app.locals.models.Enquiry, true);
            this.router.put('/draft/send-verification-code', this.sendVerificationCode.bind(this));
            this.router.put('/:id/verify-otp-update', this.verifyOTPAndUpdate.bind(this));
            this.router.get('/draft/data', this.getDraftData.bind(this));
            this.router.get('/:id', this.findById.bind(this));
            this.setRoutes();
        }

        getDraftData(req, res) {
            let draftData= {};
            const loadOrgUnits= (next) =>{
                const OrgUnit= app.locals.models.OrgUnit;
                OrgUnit.find({orgUnitType: 'dealership'}, (err, records)=>{
                    if(err){
                        return next(err);
                    }
                    draftData.orgUnits= records;
                    return next();
                });
            };

            const loadTermsAndConditions= (next)=>{
                return next();
            };

            Async.series([loadOrgUnits, loadTermsAndConditions], (err)=>{
                if(err){
                    return res.error(err);
                }
                res.success(draftData);
            });
        }

        sendVerificationCode(req, res) {
            const MainApp= app.locals.mainApp;
            const client= req.client;
            const data= req.body;
            let phoneNumber= data.customer?.contact?.phoneNumber;
            const Enquiry= app.locals.models.Enquiry;
            const OrgUnit= app.locals.models.OrgUnit;
            const by= req.orgMe||req.user;
            let orgUnitDoc;
            let enquiryDoc;

            if (Array.isArray(phoneNumber)){
                phoneNumber= phoneNumber[0];
            }
            const loadOrgUnit= (next)=>{
                OrgUnit.findById(data.orgUnitId, (err, record)=>{
                    if (err){
                        return next(err);
                    }
                    if (!record){
                        return  next('There is no such dealership!');
                    }
                    orgUnitDoc= record;
                    return next();
                })
            }

            const checkExistence= (next)=>{
                Enquiry.findOne({'customer.contact.phoneNumber':phoneNumber}, (err, record)=>{
                    if (err){
                        return this.sendUpdateResponse(req, res, err);
                    }
                    if (!record){
                        return next();
                    }
                    enquiryDoc= record;
                    return next();
                });
            };

            const setEnquiryData= (next)=>{
                if(!enquiryDoc){
                    enquiryDoc= new Enquiry({
                        createdBy: by._id||by.id
                    });
                }
                for (let key in data){
                    enquiryDoc[key]= data[key];
                    enquiryDoc.markModified(key);
                }
                enquiryDoc.client= {
                    ua: client.ua?.source,
                    ipAddress: client.ipAddress
                };
                enquiryDoc.markModified('client');
                enquiryDoc.orgUnit= {...orgUnitDoc.getShortForm()};
                enquiryDoc.markModified('orgUnit');
                enquiryDoc.save(next);
            };

            const sendVerificationCode= (next)=>{
                // if (enquiryDoc.numOTPTriggers >0){
                //     return next();
                // }
                const customerMobileNumber= enquiryDoc.customer.contact.phoneNumber;
                const ENQUIRY_OTP_TEMPLATE= {
                    "name": "customerEnquiryOTP",
                    "id": "1407169165912471496",
                    "text": "${otp} is the OTP to verify your phone number. Do not share the OTP with anyone. Team ${dealership}"
                };
                MainApp.locals.services.SMS.send(
                    customerMobileNumber,
                    ENQUIRY_OTP_TEMPLATE,
                    {
                        otp: enquiryDoc.otp,
                        dealership: orgUnitDoc.name
                    },
                    (err)=>{
                        if(err){
                            return next(err);
                        }
                        enquiryDoc.lastOTPTriggeredAt= new Date();
                        enquiryDoc.numOTPTriggers++;
                        enquiryDoc.save(next);
                    });
            };

            Async.series([
                    loadOrgUnit,
                    checkExistence,
                    setEnquiryData,
                    sendVerificationCode
                ],
                (err)=>{
                let respObject= enquiryDoc.toObject();
                delete respObject.otp;
                this.sendUpdateResponse(req, res, err, respObject);
            });
        }

        verifyOTPAndUpdate(req, res) {
            const client= req.client;
            const data= req.body;
            const id= req.params.id;
            const Enquiry= app.locals.models.Enquiry;
            const OrgUnit= app.locals.models.OrgUnit;
            const by= req.orgMe||req.user;
            let orgUnitDoc;
            let enquiryDoc;

            const loadOrgUnit= (next)=>{
                OrgUnit.findById(data.orgUnitId, (err, record)=>{
                    if (err){
                        return next(err);
                    }
                    if (!record){
                        return  next('There is no such dealership!');
                    }
                    orgUnitDoc= record;
                    return next();
                })
            };

            const loadDraftEnquiry= (next)=>{
                Enquiry.findById(id, (err, record)=>{
                    if (err){
                        return this.sendUpdateResponse(req, res, err);
                    }
                    if (!record){
                        return next('There is no enquiry/otp to validate');
                    }
                    enquiryDoc= record;
                    return next();
                });
            };

            const verifyOTP= (next)=>{
                if (data.otp === enquiryDoc.otp){
                    enquiryDoc.lastOTPVerifiedAt= new Date();
                    return next();
                }
                return next('Please check and enter the right OTP!');
            };

            const updateEnquiry= (next)=>{
                enquiryDoc.lastModifiedBy= by._id||by.id
                enquiryDoc.lastModifiedOn= new Date();
                enquiryDoc.status= 'open';
                enquiryDoc.save(next);
            }

            const sendEnquiryConfirmation= (next)=>{
                return next();
                const customerMobileNumber= enquiryDoc.customer.contact.phoneNumber;
                const ENQUIRY_OTP_TEMPLATE= {
                    "name": "customerEnquiryOTP",
                    "id": "1407168171858584222",
                    "text": "${otp} is the OTP to verify your phone number. Do not share the OTP with anyone. Team ${dealership}"
                };
                app.locals.services.SMS.send(
                    [customerMobileNumber],
                    ENQUIRY_OTP_TEMPLATE,
                    {
                        otp: enquiryDoc.otp,
                        dealership: orgUnitDoc.name
                    },
                    (err)=>{
                        if(err){
                            return next(err);
                        }
                        enquiryDoc.lastOTPTriggeredAt= new Date();
                        enquiryDoc.save(next);
                    });
            };

            Async.series([
                    loadOrgUnit,
                    loadDraftEnquiry,
                    verifyOTP,
                    updateEnquiry,
                    sendEnquiryConfirmation,
                ],
                (err)=>{
                    let respObject= enquiryDoc.toObject();
                    delete respObject.otp;
                    this.sendUpdateResponse(req, res, err, respObject);
                });
        }
    }

    return Enquiry;
};
