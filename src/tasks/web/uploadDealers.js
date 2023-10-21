const Async = require("async");
const DLUtils = require("../data-loaders/utils");
const {default: XSLX} = require("node-xlsx");
const ObjectPath = require("object-path");
const IsNumber = require('is-number');

module.exports = function (app) {

    const ERROR = {
        MANDATORY_FIELD_MISSING: {
            code: 0x01,
            name: 'Mandatory Fields Missing'
        },

        //Commit errors
        CUSTOMER_CREATION_FAILED: {
            code: 0x0100,
            name: 'Customer creation failed'
        },
        SITE_CREATION_FAILED: {
            code: 0x0200,
            name: 'Site creation failed'
        },
        USER_CREATION_FAILED: {
            code: 0x0400,
            name: 'User creation failed'
        },
        BRANCH_CREATION_FAILED: {
            code: 0x0800,
            name: 'Branch creation failed'
        },
        REGION_CREATION_FAILED: {
            code: 0x1000,
            name: 'Region creation failed'
        },

    };

    const dryRun = (by, currTask, cb) => {
        let xlsFilePath;
        const File = app.locals.models.File;

        let rows = [];
        let sites = [];

        const loadFileDetails = (next) => {
            if (!currTask.file?._id) {
                return next();
            }
            File.findById(currTask.file._id, (err, record) => {
                if (err) {
                    return next(err);
                }
                xlsFilePath = record.get('fsPath');
                console.log('processing file:', xlsFilePath);
                return next();
            });
        };

        const loadXLS = (next) => {
            if (!xlsFilePath) {
                return next();
            }
            const shortName= app.locals.org.shortName;
            const dataDef = DLUtils.processDataDef(`${shortName}/dealers`, true);
            if (!dataDef){
                return next(`Data def not found! for org ${shortName}`);
            }

            let xlsParsingOptions= {
                // type: 'binary',
                // cellDates: true,
                // cellNF: false,
                // cellText: false,
                blankrows: false
            };
            const workSheetsFromFile = XSLX.parse(xlsFilePath, xlsParsingOptions);
            const allRows = workSheetsFromFile[0].data;
            const header = allRows[0];
            const rawRows = allRows.slice(1);   //skip header row
            header.forEach((colName, index) => {
                let normalizedColName = DLUtils.normalizeString(DLUtils.stripComments(colName), true);
                if (!dataDef.fieldMap[normalizedColName]) {
                    dataDef.fieldMap[normalizedColName] = {name: colName, id: normalizedColName};
                }
                dataDef.fieldMap[normalizedColName].index = index;
            });

            let index = 0;
            let numRows = rawRows.length;
            const processRow = (row, next2) => {
                if (!row) {
                    return next2();
                }
                let record = {};
                index++;
                let isEmpty = true;
                let mandatoryFieldsMissing= [];
                dataDef.fields.forEach((field)=>{
                    let fieldId= field.id;
                    let colIndex = field.index;
                    if (field.required && !row[colIndex]){
                        mandatoryFieldsMissing.push(field.name);
                    }
                    let val= row[colIndex];
                    if (field.fun){
                        val= field.fun(val);
                    }
                    if(typeof val === 'string'){
                        val= val.trim();
                        if(field.lowercase){
                            val= val.toLowerCase();
                        }
                    }
                    if (val) {
                        isEmpty = false;
                    }
                    ObjectPath.set(record, fieldId, val);
                    // console.log(fieldId, val, colIndex);
                });
                if (!isEmpty) {
                    record._rowSeq = index;
                    record.rowNumber= index;
                    record.uniqueId= [record.customer?.name, record.customer?.address?.area].join(' ');
                    if (mandatoryFieldsMissing.length>0){
                        record.mandatoryFieldsMissing = mandatoryFieldsMissing;
                    }
                    rows.push(record);
                }
                if ((index % 10 === 0) ||(index === numRows)) {
                    currTask.updateProgress(index, next2);
                    return;
                }

                setTimeout(() => {
                    next2()
                }, 1);
            };
            currTask.setSubStatus('reading', numRows, (err) => {
                if (err) {
                    return next(err);
                }
                Async.eachSeries(rawRows, processRow, (err) => {
                    return next();
                });
            });
        }

        const processRecords = (next) => {
            let index = 0;
            let numRows = rows.length;
            const processRow = (row, next2) => {
                index++;
                const doProcess = () => {
                    if (row.mandatoryFieldsMissing?.length>0) {
                        let error1= {...ERROR.MANDATORY_FIELD_MISSING};
                        error1.name += ' '+row.mandatoryFieldsMissing.join(', ');
                        currTask.add2Skipped({
                            ...error1,
                            details: {
                                rowNumber: row.rowNumber,
                                serialNumber: row.uniqueId,
                            }
                        });
                        return;
                    }

                    currTask.add2Processed({
                        details: {
                            rowNumber: row.rowNumber,
                            serialNumber: row.uniqueId
                        }
                    });
                    row.orgUnit.branch.code= row.orgUnit.branch.name.toUpperCase();
                    row.orgUnit.region.code= row.orgUnit.region.name.toUpperCase();
                    sites.push(row);
                }
                doProcess();
                if ((index % 10 === 0)||(index === numRows)) {
                    currTask.updateProgress(index, () => {
                        return next2();
                    });
                } else {
                    return next2();
                }
            }
            currTask.setSubStatus('verifying', numRows, (err) => {
                Async.eachSeries(rows, processRow, next);
            });
        };

        const updateTaskWithData = (next) => {
            if (!currTask.data) {
                currTask.data = {};
            }
            currTask.data.sites = sites;
            currTask.markModified('data');
            currTask.save(() => {
                next();
            });
        };

        let steps = [
            loadFileDetails,
            loadXLS,
            processRecords,
            updateTaskWithData
        ];

        currTask.initRun(()=>{
            Async.series(steps, (err) => {
                currTask.finishRun(err, cb);
            });
        });
    };

    const commit = (by, currTask, cb) => {
        const OrgUser = app.locals.models.OrgUser;
        const OrgUnit = app.locals.models.OrgUnit;
        const Site = app.locals.models.Site;
        const Customer = app.locals.models.Customer;
        const Cluster = app.locals.models.Cluster;
        let addCount=0, updateCount=0;

        console.log('About to commit', currTask.code);

        let sites = currTask.data.sites;
        let index=0;
        let userUniqueIdMap= {};
        let orgUnitCodeMap= {}

        const createOrUpdateSites= (next) =>{
            const createOrUpdateSiteTop = (siteData, doneCreation) => {
                let customer;
                let site;
                let cluster;
                let branch, region;
                let bm, serviceManager, asm, technician, salesExec;

                ++index;
                console.log(`committing ${index}: ${siteData.site?.name}`);
                const createOrUpdateOrgUnit= (next2)=>{
                    const doCreateOrUpdateOrgUnit= (orgUnitType, next3)=>{
                        let orgUnitData= siteData.orgUnit[orgUnitType];
                        let name= orgUnitData.name;
                        let code= orgUnitData.code;
                        if (orgUnitCodeMap[code]){
                            if (orgUnitType === 'branch'){
                                branch= orgUnitCodeMap[code];
                            }
                            else if(orgUnitType === 'region'){
                                region= orgUnitCodeMap[code];
                            }
                            return next3();
                        }
                        OrgUnit.findOne({'$or':[{code: code}, {name:name}]}, (err, record)=>{
                            if(err){
                                return next3(err);
                            }
                            if (!record){
                                record= new OrgUnit({orgUnitType, code, name, createdBy: by._id});
                            }
                            record.orgUnitType= orgUnitType;
                            record.name= name;
                            record.lastModifiedBy= by._id;
                            if (orgUnitType === 'branch'){
                                record.parent= region.getShortForm();
                                record.markModified('parent');
                            }
                            record.save((err)=>{
                                if(!err) {
                                    if (orgUnitType === 'branch'){
                                        branch= record;
                                    }
                                    else if(orgUnitType === 'region'){
                                        region= record;
                                    }
                                    return next3();
                                }
                                console.log('error while creating orgunit', err);
                                let error;
                                if (orgUnitType === 'branch'){
                                    error= ERROR.BRANCH_CREATION_FAILED;
                                }
                                else if(orgUnitType === 'region'){
                                    error= ERROR.REGION_CREATION_FAILED;
                                }
                                currTask.add2Error({
                                    error,
                                    details: {
                                        rowNumber: siteData.rowNumber,
                                        customer: siteData.customer.name,
                                        error: err
                                    }
                                });
                                return next3();
                            });
                        });
                    };
                    Async.eachSeries(['region', 'branch'], doCreateOrUpdateOrgUnit, (err)=>{
                        if (err){
                            console.log('error while creating orgunits', err);
                        }
                        return next2(err);
                    });
                };

                const createOrUpdateOrgUser= (next2)=>{
                    const doCreateOrUpdateOrgUser= (role, next3) => {
                        let userData = siteData.orgUser[role];
                        const UNIQ_ID_REGEXP = /[^a-z0-9_.@\-]/gi;
                        if (!userData.uniqueId){
                            return next3();
                        }
                        userData.uniqueId= ''+userData.uniqueId;
                        userData.uniqueId= userData.uniqueId.replace(UNIQ_ID_REGEXP, '');
                        if (userUniqueIdMap[userData.uniqueId]){
                            return next3();
                        }
                        OrgUser.findOne({'globalUser.uniqueId': userData.uniqueId}, (err, user)=>{
                            if(err){
                                return next3(err);
                            }
                            let data= {
                                role: role,
                                firstName: userData.name,
                                globalUser: {
                                    uniqueId: userData.uniqueId
                                }
                            };
                            const doCreateOrUpdate= (doneCb) =>{
                                if (!user){ //create new user
                                    return OrgUser.doCreate(by._id, data, (err)=>{
                                        doneCb(err);
                                    });
                                }
                                return OrgUser.doUpdate(by._id, user._id, data, (err)=>{
                                    doneCb(err);
                                });
                            }
                            doCreateOrUpdate((err)=>{
                                if (err){
                                    currTask.add2Error({
                                        ...ERROR.USER_CREATION_FAILED,
                                        details: {
                                            rowNumber: siteData.rowNumber,
                                            serialNumber: siteData.customer.name,
                                            error: err
                                        }
                                    });
                                    return next3();
                                }
                                OrgUser.findOne({'globalUser.uniqueId': userData.uniqueId}, (err, record)=>{
                                    if (err){
                                        return next3(err);
                                    }
                                    if (!record){
                                        currTask.add2Error({
                                            ...ERROR.USER_CREATION_FAILED,
                                            details: {
                                                rowNumber: siteData.rowNumber,
                                                serialNumber: siteData.customer.name,
                                                error: err
                                            }
                                        });
                                        return next3();
                                    }
                                    if (role === 'bm'){
                                        record.orgUnit= region.getShortForm();
                                        record.orgUnitIds= [region._id];
                                    }
                                    else {//((role === 'asm')||(role ==='serviceManager')){
                                        record.orgUnit= branch.getShortForm();
                                        record.orgUnitIds= [branch._id, region._id];
                                    }
                                    record.markModified('orgUnit');
                                    record.markModified('orgUnitIds');
                                    record.save((err)=>{
                                        userUniqueIdMap[record.globalUser.uniqueId]= record;
                                        return next3(err);
                                    });
                                });
                            });
                        });
                    }
                    Async.eachSeries(Object.keys(siteData.orgUser), doCreateOrUpdateOrgUser, next2);
                };

                const createOrUpdateCustomer = (next2) => {
                    let customerData= siteData.customer;
                    customerData.address.pinCode= siteData.cluster.secondaryCode;
                    if (customerData.name.indexOf(customerData.address.area) === -1){
                        customerData.name= [customerData.name, customerData.address.area].join(' ');
                    }
                    Customer.findOne({name: customerData.name}, (err, record) => {
                        if (err) {
                            return next2(err);
                        }
                        if (record) {
                            customer = record;
                            for (let key in customerData){
                                customer.set(key, customerData[key]);
                                customer.markModified(key);
                            }
                            customer.save(next2);
                            return;
                        }
                        customer = new Customer({createdBy: by._id, ...customerData})
                        customer.save((err) => {
                            if (err) {
                                currTask.add2Error({
                                    ...ERROR.CUSTOMER_CREATION_FAILED,
                                    details: {
                                        rowNumber: siteData.rowNumber,
                                        customer: siteData.customer.name,
                                        error: err
                                    }
                                });
                                customer = undefined;
                                return next2();
                            }
                            return next2();
                        });
                    });
                };

                const createOrUpdateSite = (next2) => {
                    let siteDetails= siteData.site;
                    if (siteDetails.name.indexOf(customer.address.area) === -1){
                        siteDetails.name= [siteDetails.name, customer.address.area].join(' ');
                    }

                    siteDetails.address= {...customer.address};
                    Site.findOne({name: siteDetails.name}, (err, record) => {
                        if (err) {
                            return next2(err);
                        }
                        siteDetails.orgUnit= branch.getShortForm();
                        siteDetails.orgUnitIds=[branch._id, region._id];
                        siteDetails.custom= {
                            region: region.name,
                            branch: branch.name,
                            zone: siteData.zone
                        };
                        if (record) {
                            site = record;
                            for (let key in siteDetails){
                                site.set(key, siteDetails[key]);
                                site.markModified(key);
                            }
                            console.log(`about to update site ${site.name}`);
                            site.save(next2);
                            return;
                        }
                        site = new Site({createdBy: by._id, ...siteDetails})
                        site.save((err) => {
                            if (err) {
                                currTask.add2Error({
                                    ...ERROR.SITE_CREATION_FAILED,
                                    details: {
                                        rowNumber: siteData.rowNumber,
                                        site: siteData.site.name,
                                        error: err
                                    }
                                });
                                console.log('error while creating site', siteData.site.name, err);
                                site = undefined;
                                return next2();
                            }
                            console.log(`saving site:${site.name}`);
                            return next2();
                        });
                    });
                };

                const createOrUpdateCluster = (next2) => {
                    let clusterData= siteData.cluster;
                    Cluster.findOne({secondaryCode: clusterData.secondaryCode}, (err, record) => {
                        if (err) {
                            return next2(err);
                        }
                        if (record) {
                            cluster = record;
                            for (let key in clusterData){
                                cluster.set(key, clusterData[key]);
                                cluster.markModified(key);
                            }
                            console.log(`about to update cluster ${cluster.name}`);
                            cluster.save(next2);
                            return;
                        }
                        cluster = new Cluster({createdBy: by._id, ...clusterData})
                        cluster.save((err) => {
                            if (err) {
                                currTask.add2Error({
                                    ...ERROR.SITE_CREATION_FAILED,
                                    details: {
                                        rowNumber: siteData.rowNumber,
                                        cluster: siteData.cluster.secondaryCode,
                                        error: err
                                    }
                                });
                                cluster = undefined;
                                return next2();
                            }
                            console.log(`saving cluster:${cluster.name}`);
                            return next2();
                        });
                    });
                };

                const updateSite= (next2)=>{
                    let orgUsers= siteData.orgUser;
                    site.technicianId= userUniqueIdMap[orgUsers.technician.uniqueId]?._id;
                    site.salesExecId= userUniqueIdMap[orgUsers.salesExec.uniqueId]?._id;
                    site.customerId= customer._id;
                    site.clusterId= cluster._id;
                    if (cluster && !cluster._id){
                        console.log('>>>>>>>>>>>>>>>>>>>>> FATAL', cluster);
                    }
                    console.log('-----about to save site', index, site.name, site.code, cluster.code, site.clusterId);
                    site.save(next2);
                };

                const mapCluster2Users= (next2)=>{
                    const mapCluster2User= (role, next3)=>{
                        let user= userUniqueIdMap[siteData.orgUser[role].uniqueId];
                        if (!user){
                            // console.log('>>>>>>>>>>>there is an error ',siteData.orgUser[role].uniqueId, role);
                            return next3();
                        }
                        if (!user.clusterIds){
                            user.clusterIds= [];
                        }
                        if (user.clusterIds.indexOf(cluster._id) === -1){
                            user.clusterIds.push(cluster._id);
                            user.markModified('clusterIds');
                        }
                        user.orgUnit= branch.getShortForm();
                        user.markModified('orgUnit');
                        user.orgUnitIds= [branch._id, region._id];
                        user.markModified('orgUnitIds');
                        user.save(next3);
                    }
                    Async.eachSeries(['bm', 'asm', 'serviceManager'], mapCluster2User, next2);
                };

                const steps= [
                    createOrUpdateOrgUnit,
                    createOrUpdateOrgUser,
                    createOrUpdateCustomer,
                    createOrUpdateSite,
                    createOrUpdateCluster,
                    updateSite,
                    mapCluster2Users
                ];
                Async.series(steps, (err)=>{
                    if (err){
                        console.log(err);
                    }
                    if ((index % 10 === 0) || (index === sites.length)) {
                        currTask.updateProgress(index, ()=>{
                            doneCreation(err);
                        });
                        return;
                    }
                    setTimeout(() => {
                        doneCreation(err);
                    }, 1);
                });
            }
            Async.eachSeries(sites, createOrUpdateSiteTop, (err) => {
                if (err){
                    console.log(err);
                }
                console.log(`>>>>>${currTask.code}:: Added: ${addCount}, Updated: ${updateCount}`);
                return next(err);
            });
        }

        currTask.initRun(()=>{
            currTask.setSubStatus('saving', sites.length, (err) => {
                Async.series([createOrUpdateSites], (err)=>{
                    currTask.finishRun(err, cb);
                });
            });
        });
    }

    return {dryRun, commit}
};