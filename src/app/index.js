/**
 * @desc Initializes all the core services based on the boot mode.
 */
const Pino = require('pino');
const Express = require('express');
const Config = require('config');
const Async = require('async');
const Path = require('path');
const Merge = require('merge-anything');
const URL= require('url');

const K = require('../K');
const Db = require('./db');
const HttpServer = require('./httpServer');
const ExpressRoutes = require('./expressRoutes');
const Services = require('../services');
const defaultSettings = require("../config/profiles/default.json");

const app = Express();  //Global app

const init = (rootDir, mode, doneCb) => {

    const serverPort = Config.get('apiServer.port');

    const pkgJSON = require(Path.join(rootDir, "package.json"));

    app.locals.rootDir = rootDir;
    app.locals.mode = mode;
    app.locals.Config = Config;
    app.locals.credentials = require(Path.join(rootDir, Config.get('credentialsFilePath')));

    let orgsShortNames = app.locals.credentials.activeOrgs||Config.get('orgs');

    const Logger = Pino({
        prettyPrint: {
            colorize: true,
            translateTime: true,
        }
    });
    app.locals.Logger = Logger;

    const initializeDb = (next) => {
        Db.init(app, next);
    };

    const initializeServices = (next) =>{
        Services.init(app, next);
    };

    const loadDefaultData = (next) => {
        const User = app.locals.models.User;
        let sysUser;
        let rootUser;
        const createSysUser = (next2) => {
            let sysUserData = {...Config.get('sysUser')};
            sysUserData.signup = true;
            User.findOne({uniqueId:'_system'}, (err, user) =>{
                if (err){
                    return next2(err);
                }
                if (user){
                    sysUser= user;
                    app.locals.sysUser = sysUser;
                    return next2();
                }
                User.createUser(undefined, sysUserData, (err, user) => {
                    if (err) {
                        return next2(err);
                    }
                    sysUser = user;
                    app.locals.sysUser = sysUser;
                    return next2();
                });
            });

        };

        const createRootUser = (next2) => {
            let rootUserData = Config.get('rootUser');
            rootUserData.password = app.locals.credentials.rootPassword;
            User.createIfNotExists(sysUser._id, rootUserData, (err, user) => {
                if (err) {
                    return next2(err);
                }
                rootUser = user;
                return next2();
            });
        };

        const createOrgs = (next2) => {
            const Organization = app.locals.models.Organization;
            const createOrg = (orgShortName, next3)=>{
                let data = require(Path.join(rootDir, `src/config/profiles/${orgShortName}.json`));
                Organization.createIfNotExists(sysUser._id, data, (err, org) => {
                    if (err) {
                        return next3(err);
                    }
                    return next3();
                });
            };

            Async.eachSeries(orgsShortNames, createOrg, next2);
        };

        Async.series([createSysUser, createRootUser, createOrgs], (err) => {
            return next(err);
        });
    };

    const initializeHttpServer = (next) => {
        HttpServer.init(app, serverPort, next);
    };

    const initializeExpress = (next) => {
        ExpressRoutes.init(app, next);
    };

    const steps = [
        initializeDb,
        initializeServices,
        loadDefaultData
    ];
    switch (app.locals.mode) {
        case K.RUN_MODE.BUSINESS_API:
        case K.RUN_MODE.MANAGE_API:
            steps.push(initializeHttpServer);
            steps.push(initializeExpress);
            break;
        case K.RUN_MODE.WORKER:
            break;
        case K.RUN_MODE.EXEC_ONCE:
            let orgChosen= process.argv[4];
            if (orgChosen !== 'all'){
                if (orgsShortNames.indexOf(orgChosen)=== -1){
                    return doneCb('no such org - ',orgChosen);
                }
                orgsShortNames= [orgChosen];
            }
            break;
    }

    Async.series(steps, (err) => {
        if (err) {
            Logger.error(err);
            return doneCb(err);
        }
        let orgs = [];
        const loadOrganizations = (next) => {
            const Organization = app.locals.models.Organization;
            Organization.find({shortName: {$in:orgsShortNames}}, function (err, records) {
                if (err) {
                    return next(err);
                }
                orgs = records;
                return next();
            });
        };

        const getReportsToRoles= (roles, currRole) =>{
            let roleIds= [];
            for (let index=0, numRoles= roles.length; index < numRoles; index++){
                if ((roles[index].weight < currRole.weight) && roles[index].hasReports){
                    roleIds.push(roles[index].id);
                }
            }
            return roleIds;
        }

        const initializeOrganizations = (next) => {
            app.locals.orgs = {}; //Holds all the orgs initialized
            let defaultSettings = require('../config/profiles/default.json');
            let subFiles= [
                'asset',
                'commonProblem',
                'contract',
                'campaign',
                'customer',
                'menu',
                'meterType',
                'purchaseOrder',
                'service',
                'sku',
                'sparePart',
                'strings',
                'ticket',
                "vendor",
                'productCategory',
                'report',
                'site',
                'partRequisition',
                'orgUser',
                'orgUnit',
                'cluster',
                'dashboard',
                'product',
                'consumable',
                'model',
                'task',
                'sendUpdatesTask',
                'orgUnitProfile',
                'technicianLocation',
                'enquiry',
                'orgUnitRunningStats'
            ];
            subFiles.forEach((subFile)=>{
                defaultSettings[subFile]= require(`../config/profiles/default/${subFile}.json`);
            });
            const initOrg = (org, next2) => {
                const subApp = Express();
                const id = org.seqId;
                app.locals.orgs[id] = subApp;
                subApp.locals.id = id;
                subApp.locals._id= org._id;
                subApp.locals.orgObjectId= org._id;
                subApp.locals.org= org;
                subApp.locals.Config = app.locals.Config;
                let depSettings = require(Path.join(rootDir, `src/config/profiles/${org.shortName}.json`));
                if (depSettings.subFiles){
                    depSettings.subFiles.forEach((entityName)=>{
                        depSettings[entityName]= require(Path.join(rootDir, `src/config/profiles/${org.shortName}/${entityName}.json`));
                    });
                }
                if (depSettings.stringsPath){
                    depSettings.strings= require(Path.join(rootDir, `src/config/profiles/${org.shortName}/strings.json`));
                }
                if (depSettings.menuPath){
                    depSettings.menu= require(Path.join(rootDir, `src/config/profiles/${org.shortName}/menu.json`));
                }
                let subAppSettings = Merge.merge(JSON.parse(JSON.stringify(defaultSettings)), depSettings);

                let entities= [
                    'asset',
                    'contract',
                    'campaign',
                    'customer',
                    'orgUser',
                    'orgUnit',
                    'vendor',
                    'rateCard',
                    'service',
                    'sku',
                    'accessory',
                    'sparePart',
                    'meterType',
                    'commonProblem',
                    'purchaseOrder',
                    'productCategory',
                    'report',
                    'site',
                    'partRequisition',
                    'orgUser',
                    'orgUnit',
                    'cluster',
                    'ticket',
                    'product',
                    'consumable',
                    'model',
                    'task',
                    'sendUpdatesTask',
                    'orgUnitProfile',
                    'technicianLocation',
                    'enquiry',
                    'orgUnitRunningStats'
                ];
                entities.forEach((entity)=>{
                    let fieldDefs= subAppSettings[entity]?.fields;
                    if (!fieldDefs){
                        return;
                    }
                    const expandFieldDef= (screenFieldDef)=>{
                        let fieldId= screenFieldDef.id;
                        let fieldDef= {
                            id: fieldId,
                            ...screenFieldDef,
                            ...fieldDefs[fieldId]
                        };
                        fieldDef.label= (subAppSettings.strings[entity]?.fields?.[fieldId])||fieldId;

                        let derivedId= '';
                        if (fieldDef.translateNameSpace){
                            derivedId += 'Translated';
                        }
                        if (derivedId){
                            fieldDef.derivedId= fieldDef.id+derivedId;
                        }
                        if (fieldDef.target){
                            fieldDef.linkId= fieldDef.id+'Link';
                        }
                        return fieldDef;
                    }
                    let listFieldDefs= subAppSettings[entity].list?.fields;
                    if (listFieldDefs) {
                        let listFieldObjects = [];
                        listFieldDefs.forEach((listFieldDef) => {
                            listFieldObjects.push(expandFieldDef(listFieldDef));
                        });
                        subAppSettings[entity].list.fields = listFieldObjects;
                    }
                    let detailsSections= subAppSettings[entity].details?.sections;
                    if (detailsSections){
                        detailsSections.forEach((section)=>{
                            let sectionFieldObjects= [];
                            if (!section.fields){
                                return;
                            }
                            section.fields.forEach((sectionFieldDef)=>{
                                sectionFieldObjects.push(expandFieldDef(sectionFieldDef));
                            });
                            section.fields= sectionFieldObjects;
                        });
                    }
                    let editSections= subAppSettings[entity].edit?.sections;
                    if (editSections){
                        editSections.forEach((section)=>{
                            let sectionFieldObjects= [];
                            if (section.type){
                                let sDef= expandFieldDef(section);
                                for (let key in sDef){
                                    section[key]= sDef[key];
                                }
                                return;
                            }
                            if (!section.fields){
                                return;
                            }
                            section.fields.forEach((sectionFieldDef)=>{
                                sectionFieldObjects.push(expandFieldDef(sectionFieldDef));
                            });
                            section.fields= sectionFieldObjects;
                        });
                    }
                    let actionDialogs= subAppSettings[entity].actionDialogs;
                    if (actionDialogs){
                        for (let actionId in actionDialogs){
                            actionDialogs[actionId].sections.forEach((section)=>{
                                let sectionFieldObjects= [];
                                if (section.type){
                                    let sDef= expandFieldDef(section);
                                    for (let key in sDef){
                                        section[key]= sDef[key];
                                    }
                                    return;
                                }
                                if (!section.fields){
                                    return;
                                }
                                section.fields.forEach((sectionFieldDef)=>{
                                    sectionFieldObjects.push(expandFieldDef(sectionFieldDef));
                                });
                                section.fields= sectionFieldObjects;
                            });
                        }
                    }
                });

                //Handle menu
                let menuIconBaseUrl= `${app.locals.credentials.baseUrl}/images/app-icons/menu/`;
                let applicableSections= [];
                subAppSettings.menu.sections?.forEach((section)=>{
                    if (!section?.items){
                        return;
                    }
                    let applicableItems= [];
                    let applicableItemsMap= {};
                    section.items.forEach((baseItem)=>{
                        let item= {...baseItem}
                        let overWritingConfig= subAppSettings.menu.items[item.id];
                        if (overWritingConfig){
                            for (let key in overWritingConfig){
                                item[key]= overWritingConfig[key];
                            }
                        }
                        if (item.isDisabled){
                            return;
                        }
                        if (!item.type){
                            item.type= 'internalLink';
                        }
                        // console.log(item.id, item.entity);
                        if (item.entity && !subAppSettings[item.entity]?.isEnabled){
                            return;
                        }
                        // console.log('moving to applicable', item.id);
                        if (!item.route){
                            item.route= ['/'+item.entity];
                            if (item.action){
                                item.route.push(item.action);
                            }
                        }
                        if (item.icon[0] !== '/'){
                            item.icon= menuIconBaseUrl+item.icon;
                        }
                        applicableItems.push(item);
                        applicableItemsMap[item.id]= item;
                    });
                    let sectionItems= subAppSettings.menu?.sectionItems?.[section.id]?.items;
                    if (sectionItems){
                        applicableItems= [];
                        sectionItems.forEach((itemId)=>{
                            if(applicableItemsMap[itemId]){
                                applicableItems.push(applicableItemsMap[itemId]);
                            }
                            else {
                                console.log(`>>>>>${itemId} not found in the menu applicable items for section ${section.id}`);
                            }
                        });
                    }
                    section.items= [...applicableItems];
                    if(applicableItems.length !== 0){
                        applicableSections.push(section);
                    }
                });
                subAppSettings.menu.sections= applicableSections;

                let subAppBaseUrl= app.locals.credentials.baseUrl;
                if (subAppSettings.subDomain){
                    let urlParsed= URL.parse(subAppBaseUrl, false);
                    subAppBaseUrl= `${urlParsed.protocol}//${subAppSettings.subDomain}.${urlParsed.host}${urlParsed.pathname}`;
                }
                subAppSettings.baseUrl= subAppBaseUrl;
                if (subAppSettings.ticket.pdCheckList){
                    subAppSettings.ticket.pmCheckList= subAppSettings.ticket.pdCheckList;
                }
                if (subAppSettings.ticket.bdCheckList?.source === 'pmCheckList'){
                    subAppSettings.ticket.bdCheckList= subAppSettings.ticket.pmCheckList;
                }
                let allPermissions= {};
                for (let resource in subAppSettings){
                    if (subAppSettings[resource].actions){
                        allPermissions[resource]= {...subAppSettings[resource].actions}
                    }
                }
                subApp.locals.allPermissions= allPermissions;
                subAppSettings.roleMap= {};
                let roleIds= [];
                subAppSettings.strings.orgUser.role= {};
                for (let index=0, numRoles=subAppSettings.orgUser.roles.length; index< numRoles; index++){
                    let role= subAppSettings.orgUser.roles[index];
                    subAppSettings.strings.orgUser.role[role.id]= role.name;
                    roleIds.push(role.id);
                    if (subAppSettings.orgUser.roles[index].access === '*'){
                        subAppSettings.orgUser.roles[index].access = allPermissions;
                    }
                    else {
                        for (let entityPermission in subAppSettings.orgUser.roles[index].access){
                            if (subAppSettings.orgUser.roles[index].access[entityPermission] === '*'){
                                subAppSettings.orgUser.roles[index].access[entityPermission]= {...allPermissions[entityPermission]};
                            }
                        }
                    }
                    subAppSettings.orgUser.roles[index].reportsTo= getReportsToRoles(subAppSettings.orgUser.roles, subAppSettings.orgUser.roles[index]);
                    if (subAppSettings.orgUser.roles[index].reportsTo.length === 0){
                        subAppSettings.orgUser.roles[index].reportsTo= undefined;
                    }
                    subAppSettings.roleMap[subAppSettings.orgUser.roles[index].id]= subAppSettings.orgUser.roles[index];
                }
                subAppSettings.orgUser.roleIds= roleIds;
                subApp.locals.Settings= subAppSettings;
                subApp.locals.Logger = Logger.child({org: org.name});
                subApp.locals.sysUser = app.locals.sysUser;
                subApp.locals.rootDir = app.locals.rootDir;
                subApp.locals.credentials = {...app.locals.credentials};
                subApp.locals.mainApp= app;
                app.use(`/api/org/${id}`, subApp);
                require('./org')(subApp, mode, function (err) {
                    app.locals.orgs[id] = subApp;
                    if (err) {
                        Logger.error('Failed while instantiating org: ' + id);
                    } else {
                        app.use('/api/org/' + id, subApp);
                        Logger.info(`Done initializing org: ${id}`);
                    }
                    return next2();
                });
            };

            Async.eachSeries(orgs, initOrg, function (err) {
                if (err) {
                    Logger.error('Initialization of some orgs might have failed!');
                    Logger.error(err);
                }
                return next();
            });
        };

        Async.series([loadOrganizations, initializeOrganizations], (err) => {
            if (err) {
                return doneCb(err);
            }
            if (mode !== K.RUN_MODE.MANAGE_API) {
                return doneCb();
            }
            //Fallback routes for sending 404, 500 errors
            ExpressRoutes.init2(app, (err) => {
                return doneCb(err);
            });
        })
    });
};

const shutdown = (doneCb) => {
    //TODO: shutdown all the ones which got initialized in the init
    const orgs = app.locals.orgs;
    const shutdownApp = (orgId, next) => {
        let org = orgs[orgId];
        org.locals.shutdown(next);
    };
    Async.eachSeries(Object.keys(orgs), shutdownApp, doneCb);
};

module.exports = {
    init,
    shutdown
};
