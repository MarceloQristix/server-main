const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Moment = require("moment");
const Async = require('async');
const {database} = require("firebase-admin");

module.exports= {
    getIds : function (cfgValues){
        return Lodash.map(cfgValues, 'id');
    },
    ObjectIdChildSchema: new Schema({
        _id: ObjectId
    }),
    CollSchemaShort: {
        _id : ObjectId,
        name: String,
        displayName: String,
        code: String,
        secondaryCode: String
    },
    AddressSchema: {
        addrLine1       : {
            type        : String,
            trim    : true
            // required    : true
        },
        addrLine2       : {
            type        : String,
            trim    : true
            // required    : true
        },
        landmark        : {
            type        : String,
            trim    : true
        },
        area            : {
            type        : String,
            trim        : true
        },
        city            : {
            type        : String,
            trim    : true
            // required    : true
        },
        state           : {
            type        : String,
            trim    : true
            // required    : true
        },
        pinCode         : {
            type        : String,
            trim    : true
            // required    : true
        },
        loc             : {
            lat         : {type: Number},
            lng         : {type: Number},
        }
    },
    ContactSchema: {
        name                : {
            type            : String,
            trim            : true
        },
        phoneNumber         : {
            type            : String,
            trim            : true,
            match           : /[0-9]*/
        },
        altPhoneNumber      : {
            type            : String,
            trim            : true,
            match           : /[0-9]*/
        },
        email               : {
            type            : String,
            trim            : true,
            lowercase       : true
        }
    },
    getLastNonEmptyElement: function (arr) {
        if (arr.length === 0){
            return '';
        }
        if (arr.length === 1){
            return arr[0];
        }
        return arr[arr.length-1]||arr[arr.length-2];
    },
    trimRight: function (arr){
        if (arr.length === 0){
            return arr;
        }
        if (arr.length === 1){
            return arr[0];
        }
        return arr[arr.length-1]||arr[arr.length-2];
    },
    getDataScopeAccessConditions: function (app, entityName, orgMe, doneCb){
        let filter= {};
        let customerIds= [];
        let siteIds= [];
        let clusterIds= orgMe?.clusterIds;
        let dataScope;
        let orgUnit= orgMe?.orgUnit;
        let orgUnitIds= [];
        let myId= orgMe?._id;

        const runBasicChecks = (next)=>{
            if (['asset', 'ticket','contract', 'customer', 'site', 'org-user', 'org-unit', 'report', 'attendance', 'task'].indexOf(entityName) === -1){
                return  next();
            }
            if (!orgMe) {   //admin users
                return next();
            }
            let roleDef= orgMe.roleDef;
            if (!roleDef || !roleDef.dataScope){
                return next();
            }
            dataScope= roleDef.dataScope[entityName]|| roleDef.dataScope.default;
            return next();
        };

        const loadLeafEntities= (next) =>{
            const OrgUnit= app.locals.models.OrgUnit;
            if (dataScope !== 'orgUnit'){
                return next();
            }
            OrgUnit.distinct('_id', {'$or':[{_id: orgUnit._id},{'parent._id': orgUnit._id}] }, (err, ids)=>{
               if(err){
                   return next(err);
               }
               orgUnitIds= ids;
               return next();
            });
        };

        const loadAccessibleCustomerIds= (next)=>{
            if (dataScope !== 'customer'){
                return next();
            }
            const Customer= app.locals.models.Customer;
            if (orgMe.virtualRef?._id){
                customerIds= [orgMe.virtualRef._id];
                return next();
            }
            Customer.distinct('_id', {'accountMgr._id': orgMe._id}, (err, ids)=>{
                if (err){
                    return next(err);
                }
                customerIds= ids;
                return next(err);
            });
        };

        const loadSiteIds= (next) => {
            const Site= app.locals.models.Site;
            if (dataScope !== 'site'){
                return next();
            }
            Site.distinct('_id', {'$or':[{technicianId: myId}, {salesExecId: myId}]},(err, ids)=>{
                if(err){
                    return next(err);
                }
                siteIds= ids;
                return next();
            });
        }

        const loadConditions4Entity= (next) =>{
            console.log('...datascope', dataScope);
            if (!dataScope){
                return next();
            }
            if (entityName === 'ticket') {
                switch (dataScope) {
                    case 'self':
                        filter['assignee._id'] = orgMe._id;
                        break;
                    case 'reports':
                        filter['assignee._id'] = [orgMe._id].concat(orgMe.directReports || [], orgMe.indirectReports || []);
                        break;
                    case 'cluster':
                        filter['clusterId']= {$in: clusterIds};
                        break;
                    case 'customer':
                        filter['customer._id'] = {$in:customerIds};
                        break;
                    case 'site':
                        filter['site._id']= {$in: siteIds};
                        break;
                    case 'orgUnit':
                        filter['orgUnitIds'] = {$in: orgUnitIds};
                        break;
                }
            }
            else if (entityName === 'customer'){
                switch (dataScope){
                    case 'customer':
                        filter['_id'] = {$in: customerIds};
                        break;
                    case 'self':
                        filter.createdBy= orgMe._id;
                }
            }
            else if (['site', 'asset', 'contract'].indexOf(entityName) !== -1) {
                switch (dataScope){
                    case 'all':
                        break;
                    case 'self':
                        filter.createdBy= orgMe._id;
                        break;
                    case 'customer':
                        filter['customer._id'] = {$in: customerIds};
                        break;
                    case 'orgUnit':
                        filter['orgUnit._id'] = {$in: orgUnitIds};
                }
            }
            else if (entityName === 'org-user') {
                filter['$or']=[
                    {_id: {$in: (orgMe.directReports || []).concat(orgMe.indirectReports || [])}},
                    {createdBy: orgMe._id}
                ]
            }
            else if (entityName === 'org-unit') {
                filter['parent._id'] = orgUnit?._id;
            }
            else if (entityName == 'attendance'){
                filter['user._id'] = (orgMe.directReports || []).concat(orgMe.indirectReports || []);
            }
            else if (['report', 'task'].indexOf(entityName) !== -1) {
                filter['createdBy'] = orgMe._id;
            }
            return next();
        };

        Async.series([runBasicChecks, loadLeafEntities, loadSiteIds, loadAccessibleCustomerIds, loadConditions4Entity], (err)=>{
                return doneCb(err, {filter, dataScope});
        })
    },

    getEventInstance(by, EventLogModel, event, entity, entityType) {
        const Event = EventLogModel;
        let evt = new Event({
            evtType: event.code,
            name : event.name,
            desc: event.desc,
            doneBy: {
                _id: by._id||by.id,
                name: by.name,
                code: by.code
            },
            scope:{
                sType: entityType,
                _id: entity._id,
                code: entity.secondaryCode || entity.code
            },
            createdBy: by._id||by.id,
            when: new Date()
        });
        return evt;
    }

};
