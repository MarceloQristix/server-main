const Async = require("async");
const DLUtils = require("../data-loaders/utils");
const {default: XSLX} = require("node-xlsx");
const ObjectPath = require("object-path");
const IsNumber = require('is-number');

module.exports = function (app) {

    const ERROR = {
        VEHICLE_NOT_FOUND_IN_MASTER: {
            code: 0x01,
            name: 'Model+Color Not found in master data'
        },
        UNIQUE_ID_NOT_FILLED: {
            code: 0x02,
            name: 'Unique Order no is empty'
        },
        ORG_UNIT_NOT_REGISTERED: {
            code: 0x04,
            name: 'Dealership not registered'
        },
        CURRENT_WAITING_PERIOD_DATA_FORMAT_INVALID: {
            code:0x08,
            name: 'Current Waiting period column data format invalid'
        },
        UNIQUE_ID_INVALID: {
            code:0x10,
            name: '"ORD" is not present in Order Number'
        },
        UNIQUE_ID_DOES_NOT_CONTAIN_ORDER: {
            code:0x20,
            name: 'Mismatch between "Unique Order Number" and "Order Number"'
        },
        //Commit errors
        CUSTOMER_CREATION_FAILED: {
            code: 0x0100,
            name: 'Customer creation failed'
        }
    };


    const dryRun = (by, currTask, cb) => {
        let xlsFilePath;
        const Asset = app.locals.models.Asset;
        const OrgUser = app.locals.models.OrgUser;
        const File = app.locals.models.File;
        const OrgUnit = app.locals.models.OrgUnit;
        const SKU = app.locals.models.SKU;

        let rows = [];
        let assets = [];
        let skuMap = {};
        let orgUnitMap = {};

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
            const dataDef = DLUtils.processDataDef(`${shortName}/assets`, true);
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
                dataDef.fields.forEach((field)=>{
                    let fieldId= field.id;
                    let colIndex = field.index;
                    if (row[colIndex]) {
                        isEmpty = false;
                    }
                    let val= row[colIndex];
                    if (field.fun){
                        val= field.fun(val);
                    }
                    if(typeof val === 'string'){
                        val= val.trim();
                    }
                    ObjectPath.set(record, field.id, val);
                    // console.log(fieldId, val, colIndex);
                });
                if (!isEmpty) {
                    record._rowSeq = index;
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

        const loadOrgUnits = (next) => {
            //FIXME: need to add some checks based on the user creating the task
            OrgUnit.find({orgUnitType: 'dealership'}, (err, records) => {
                if (err) {
                    return next(err);
                }
                records.forEach((record) => {
                    orgUnitMap[record.code.toUpperCase()] = record;
                });
                return next();
            });
        };

        const loadSKUs = (next) => {
            SKU.find({}, (err, records) => {
                if (err) {
                    return next(err);
                }
                records.forEach((record) => {
                    if (!record.attrs || !record.attrs.color){
                        return;
                    }
                    let skuName = (record.model + record.attrs.color).toLowerCase();
                    let normalizedSKUName = DLUtils.normalizeString(skuName, true);
                    skuMap[normalizedSKUName] = record;
                });
                return next();
            });
        };

        const processRecords = (next) => {
            let index = 0;
            let numRows = rows.length;
            const processRow = (row, next2) => {
                index++;
                const doProcess = () => {
                    if (!row.serialNumber) {
                        currTask.add2Skipped({
                            ...ERROR.UNIQUE_ID_NOT_FILLED,
                            details: {
                                rowNumber: row.rowNumber,
                                serialNumber: row.serialNumber
                            }
                        });
                        return;
                    }
                    row.serialNumber= row.serialNumber.toUpperCase();
                    if (row.serialNumber.indexOf('ORD') === -1){
                        currTask.add2Skipped({
                            ...ERROR.UNIQUE_ID_INVALID,
                            details: {
                                rowNumber: row.rowNumber,
                                serialNumber: row.serialNumber
                            }
                        });
                        return;
                    }
                    if (row.serialNumber.indexOf(row.extraCode1) === -1){
                        currTask.add2Skipped({
                            ...ERROR.UNIQUE_ID_DOES_NOT_CONTAIN_ORDER,
                            details: {
                                rowNumber: row.rowNumber,
                                serialNumber: row.serialNumber
                            }
                        });
                        return;
                    }
                    if (row.orgUnit?.code){
                        row.orgUnit.code= row.orgUnit.code.toUpperCase();
                        if (!orgUnitMap[row.orgUnit.code]){
                            currTask.add2Skipped({
                                ...ERROR.ORG_UNIT_NOT_REGISTERED,
                                details: {
                                    rowNumber: row.rowNumber,
                                    serialNumber: row.serialNumber,
                                    orgUnitCode: row.orgUnit.code
                                }
                            });
                            return;
                        }
                    }
                    let skuName = DLUtils.normalizeString(row.sku.model + row.sku.color, true).toLowerCase();
                    if (!skuMap[skuName]) {
                        currTask.add2Skipped({
                            ...ERROR.VEHICLE_NOT_FOUND_IN_MASTER,
                            details: {
                                rowNumber: row.rowNumber,
                                serialNumber: row.serialNumber,
                                model: row.sku.model,
                                color: row.sku.color
                            }
                        });
                        return;
                    }
                    row.skuId = skuMap[skuName]._id;

                    const cleanup= (str)=>{
                        let week= (str+'').toLowerCase()
                            .replace('week', '')
                            .replace('s', '')
                            .trim();
                        return week
                    };

                    let minWaitingPeriod= cleanup(row.custom.currentMinWaitingPeriodInWeeks);
                    let maxWaitingPeriod= cleanup(row.custom.currentMaxWaitingPeriodInWeeks);
                    if (IsNumber(minWaitingPeriod) && IsNumber(maxWaitingPeriod)){
                        row.custom.currentWaitingPeriodInWeeks= minWaitingPeriod+ ' - '+maxWaitingPeriod + ' Weeks';
                    }
                    else {
                        if (minWaitingPeriod !== maxWaitingPeriod){
                            currTask.add2Skipped({
                                ...ERROR.CURRENT_WAITING_PERIOD_DATA_FORMAT_INVALID,
                                details: {
                                    rowNumber: row.rowNumber,
                                    serialNumber: row.serialNumber,
                                    model: row.sku.model,
                                    color: row.sku.color
                                }
                            });
                            return;
                        }
                        row.custom.currentWaitingPeriodInWeeks= minWaitingPeriod;
                    }

                    currTask.add2Processed({
                        details: {
                            rowNumber: row.rowNumber,
                            serialNumber: row.serialNumber,
                            orgUnitCode: row.orgUnit?.code
                        }
                    });
                    assets.push(row);
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
            currTask.data.assets = assets;
            currTask.markModified('data');
            currTask.save(() => {
                next();
            });
        };

        let steps = [
            loadFileDetails,
            loadXLS,
            loadOrgUnits,
            loadSKUs,
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
        const Asset = app.locals.models.Asset;
        const OrgUser = app.locals.models.OrgUser;
        const File = app.locals.models.File;
        const OrgUnit = app.locals.models.OrgUnit;
        const SKU = app.locals.models.SKU;
        const Customer = app.locals.models.Customer;
        let addCount=0, updateCount=0;

        console.log('About to commit', currTask.code);

        let assets = currTask.data.assets;
        let index=0;

        const createOrUpdateAsset = (assetData, doneCreation) => {
            let customer;
            let asset;
            let sku;
            ++index;
            if (assetData.serialNumber.indexOf('ORD') === 0){
                assetData.serialNumber= assetData.orgUnit.code + assetData.serialNumber;
            }
            const loadSKU = (next) => {
                SKU.findById(assetData.skuId, (err, record) => {
                    if (err) {
                        return next();
                    }
                    sku = record;
                    return next();
                });
            };
            const loadOrCreateDraftAsset = (next) => {
                Asset.findOne({serialNumber: assetData.serialNumber}, (err, record) => {
                    if (err) {
                        return next(err);
                    }
                    if (record) {
                        asset = record;
                        updateCount++;
                        return next();
                    }
                    Asset.findOne({'status': '01_draft'}, {}, {sort: {seqId: 1}}, (err, record) => {
                        if (err) {
                            return next();
                        }
                        if (record) {
                            asset = record;
                            addCount++;
                            return next();
                        }
                        asset = new Asset({createdBy: app.locals.admin._id}); //create new draft asset
                        asset.save((err) => {
                            if (err) {
                                return next(err);
                            }
                            addCount++;
                            return next();
                        });
                    });
                });
            };

            const createCustomerIfNotExists = (next) => {
                let cond= {};
                cond= {'contact.phoneNumber': assetData.customer.contact.phoneNumber};
                Customer.findOne(cond, (err, record) => {
                    if (err) {
                        return next(err);
                    }
                    if (record) {
                        customer = record;
                        for (let key in assetData.customer){
                            customer.set(key, assetData.customer[key]);
                            customer.markModified(key);
                        }
                        customer.save(next);
                        return;
                    }
                    customer = new Customer({createdBy: by._id, ...assetData.customer})
                    customer.save((err) => {
                        if (err) {
                            currTask.add2Error({
                                ...ERROR.CUSTOMER_CREATION_FAILED,
                                details: {
                                    rowNumber: asset.rowNumber,
                                    serialNumber: asset.serialNumber,
                                    customer: asset.customer,
                                    error: err
                                }
                            });
                            customer = undefined;
                            return next();
                        }
                        return next();
                    });
                });
            };

            const loadOrgUnit = (next) => {
                OrgUnit.findOne({code: assetData.orgUnit.code}, (err, record) => {
                    if (err) {
                        return next(err);
                    }
                    if (!record) {
                        console.log('fatal: orgunit mapped to user ont found', assetData.orgUnit.code, assetData.orgUnit.rowNumber);
                        return next();
                    }
                    assetData.orgUnit = record.getShortForm();
                    assetData.orgUnit.custom = {...record.custom};
                    return next();
                });
            }

            const updateAsset = (next) => {
                if (!customer) {
                    return next();
                }
                let data= {
                    ...assetData,
                    customer: customer.getShortForm(),
                    contact: {...customer.contact},
                };
                if (sku) {
                    let skuObj = sku.toObject();
                    data.extSku = {...assetData.sku};
                    data.name = assetData.sku.suffixName + ' ' + assetData.sku.color;
                    data.sku = {
                        _id: sku._id,
                        name: sku.name,
                        model: sku.model,
                        variant: sku.variant,
                        attrs: {...skuObj.attrs}
                    };
                }
                data.task = currTask.getShortForm();
                currTask.add2Processed({
                    details: {
                        serialNumber: assetData.serialNumber
                    }
                });
                Asset.doUpdate(by, asset._id, data, next);
                return;
            };

            const steps= [
                loadSKU,
                loadOrCreateDraftAsset,
                createCustomerIfNotExists,
                loadOrgUnit,
                updateAsset
            ];
            Async.series(steps, (err)=>{
                if ((index % 10 === 0) || (index === assets.length)) {
                    currTask.updateProgress(index, doneCreation);
                    return;
                }
                setTimeout(() => {
                    doneCreation();
                }, 1);
            });
        }

        currTask.initRun(()=>{
            currTask.setSubStatus('saving', assets.length, (err) => {
                Async.eachSeries(assets, createOrUpdateAsset, (err) => {
                    console.log(`>>>>>${currTask.code}:: Added: ${addCount}, Updated: ${updateCount}`);
                    currTask.finishRun(err, cb);
                });
            });
        });
    }

    return {dryRun, commit}
};