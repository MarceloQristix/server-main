const Async = require('async');
const Lodash = require('lodash');

const {getDataScopeAccessConditions} = require("../../models/utils");


module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Dashboard extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'dashboard'].join('/'), undefined, true);
            this.router.get('/', this.getDashboardStats.bind(this));
            this.router.get('/:id', this.getDashboardStats.bind(this));
            this.router.get('/section/:sectionId', this.getDashboardSectionStats.bind(this));
            app.use(this.basePath, this.router);
        }

        getDashboardSectionStats(req, res) {
            const sectionDef = require('../../config/core/dashboardv2')(app, req.params.sectionId);
            let outData= {};
            let accessConditionsByCollection= {};
            let orgMe= req.orgMe;

            const getData = (def, cb) =>{
                const dataDef = def.data;
                const Model = app.locals.models[dataDef.collection];
                if (!Model){
                    return cb();
                }
                getDataScopeAccessConditions(app, Model.modelName, orgMe, (err, conditions)=> {
                    if(err){
                        return cb(err);
                    }
                    let accessConditions= conditions.filter;
                    accessConditionsByCollection[Model.modelName]= accessConditions;
                    console.log('about to get data for - ', def.id);
                    let addAccessConditions= (conditions) =>{
                        return {...conditions, ...accessConditions};
                    }
                    switch(dataDef.op){
                        case 'count':
                            Model.countDocuments(addAccessConditions(dataDef.condition), (err, count)=>{
                                if (err){
                                    console.log(err);
                                    return cb();
                                }
                                outData[def.id]= count;
                                return cb();
                            }).read('secondary');
                            break;
                        case 'findOne':
                            if (dataDef.projectionKey){
                                dataDef.projection= { };
                                dataDef.projection[dataDef.projectionKey]= 1;
                            }
                            Model.findOne(addAccessConditions(dataDef.condition), dataDef.projection, dataDef.options, (err, record)=>{
                                if (err){
                                    console.log(err);
                                    return cb();
                                }
                                let value= Lodash.get(record, dataDef.projectionKey);
                                if (def.map){
                                    for (let key in def.map){
                                        outData[key]=Lodash.get(value, def.map[key]);
                                    }
                                }
                                else {
                                    outData[def.id]= value
                                }
                                return cb();
                            }).read('secondary');
                            break;
                        case 'find':
                            if (def.id === 'top5CustomersByRevenue') {
                                const Contract = app.locals.models.Contract;
                                let pipeline= [
                                    {$match: addAccessConditions({status:'03_active'})},
                                    {$project:{customer:1, charges:1}},
                                    {$group: {_id:'$customer._id', name: {$first: '$customer.name'}, code: {$first: '$customer.code'}, 'value':{$sum: "$charges.amount"}}},
                                    {$sort: {value:-1}},
                                    {$limit: 5}
                                ]
                                Contract.aggregate(pipeline, (err, records)=>{
                                    if (err){
                                        console.log(err);
                                    }
                                    else {
                                        outData[def.id] = records;
                                    }
                                    return cb();
                                }).read('secondary');
                            }
                            else if (def.id === 'top5CustomersByTickets') {
                                const Ticket = app.locals.models.Ticket;
                                let pipeline= [
                                    {$match: addAccessConditions({})},
                                    {$project:{customer:1}},
                                    {$group: {_id:'$customer._id', name: {$first: '$customer.name'}, code: {$first: '$customer.code'}, 'value':{$sum: 1}}},
                                    {$sort: {value:-1}},
                                    {$limit: 5}
                                ]
                                Ticket.aggregate(pipeline, (err, records)=>{
                                    if (err){
                                        console.log(err);
                                    }
                                    else {
                                        outData[def.id] = records;
                                    }
                                    return cb();
                                }).read('secondary');
                            }
                            // Model.find(dataDef.condition, dataDef.projection, dataDef.options, (err, records)=>{
                            //     if (err){
                            //         console.log(err);
                            //         return cb();
                            //     }
                            //     outData[def.id]= records;
                            //     return cb();
                            // });
                            break;
                    }
                });
            };

            const computeSectionWiseData = (section, next2)=>{
                const blocks = section.blocks;
                const computeBlockWiseData= (block, next3) =>{
                    if (!block.id){
                        console.log('block id does not exist - ',block.name);
                        return next3();
                    }
                    const populateItemsData = ()=>{
                        if (!block.items){
                            return next3();
                        }
                        const computeItemWiseData = (item, next4) =>{
                            getData(item,(err, data)=>{
                                if (err){
                                    return next4(err);
                                }
                                return next4();
                            });
                        };
                        Async.eachSeries(block.items, computeItemWiseData, (err)=>{
                            next3(err);
                        });
                    };

                    if (block.data) {
                        getData(block, (err, data)=>{
                            if (err){
                                return next3(err);
                            }
                            populateItemsData();
                        });
                    }
                    else {
                        populateItemsData();
                    }
                };
                Async.eachSeries(blocks, computeBlockWiseData, (err)=>{
                    if(err){
                        return next2(err);
                    }
                    return next2();
                });
            };

            const computePendingReasonsData= (doneCb) =>{
                const Ticket = app.locals.models.Ticket;
                let accessConditions= accessConditionsByCollection[Ticket.modelName];
                let addAccessConditions= (conditions) =>{
                    return {...conditions, ...accessConditions};
                }
                let pipeline= [
                    {$match: addAccessConditions({status: '03_on_hold', sType:{$nin:['pm']},holdReason: {$exists:true}})},
                    {$project:{holdReason:1}},
                    {$group: {_id:'$holdReason', 'value':{$sum: 1}}},
                ]
                Ticket.aggregate(pipeline, (err, records)=>{
                    console.log(records)
                    if (err){
                        console.log(err);
                    }
                    else {
                        if (records.length >0){
                            outData.pendingReasons = {
                                labels: Lodash.map(records, '_id'),
                                values: Lodash.map(records, 'value')
                            };
                        }
                    }
                    return doneCb();
                }).read('secondary');
            };

            Async.eachSeries([sectionDef], computeSectionWiseData, (err)=>{
                if (err){
                    return res.error({error:err});
                }
                res.success({ id: new Date().getTime(), data: outData, def: sectionDef });

                // computePendingReasonsData((err)=>{
                //     if (err){
                //         return res.error({error:err});
                //     }
                //     res.success({ id: new Date().getTime(), data: outData, def: DashboardDef });
                // });
            });
        }


        getDashboardStats(req, res) {
            const DashboardDef = require('../../config/core/dashboard')();
            const sections = DashboardDef.sections;
            let outData= {};
            let accessConditionsByCollection= {};
            let orgMe= req.orgMe

            const getData = (def, cb) =>{
                const dataDef = def.data;
                const Model = app.locals.models[dataDef.collection];
                if (!Model){
                    return cb();
                }
                getDataScopeAccessConditions(app, Model.modelName, orgMe, (err, conditions)=> {
                    if(err){
                        return cb(err);
                    }
                    let accessConditions= conditions.filter;
                    accessConditionsByCollection[Model.modelName]= accessConditions;
                    console.log('about to get data for - ', def.id);
                    let addAccessConditions= (conditions) =>{
                        return {...conditions, ...accessConditions};
                    }
                    switch(dataDef.op){
                        case 'count':
                            Model.countDocuments(addAccessConditions(dataDef.condition), (err, count)=>{
                                if (err){
                                    console.log(err);
                                    return cb();
                                }
                                outData[def.id]= count;
                                return cb();
                            }).read('secondary');
                            break;
                        case 'findOne':
                            if (dataDef.projectionKey){
                                dataDef.projection= { };
                                dataDef.projection[dataDef.projectionKey]= 1;
                            }
                            Model.findOne(addAccessConditions(dataDef.condition), dataDef.projection, dataDef.options, (err, record)=>{
                                if (err){
                                    console.log(err);
                                    return cb();
                                }
                                let value= Lodash.get(record, dataDef.projectionKey);
                                if (def.map){
                                    for (let key in def.map){
                                        outData[key]=Lodash.get(value, def.map[key]);
                                    }
                                }
                                else {
                                    outData[def.id]= value
                                }
                                return cb();
                            }).read('secondary');
                            break;
                        case 'find':
                            if (def.id === 'top5CustomersByRevenue') {
                                const Contract = app.locals.models.Contract;
                                let pipeline= [
                                    {$match: addAccessConditions({status:'03_active'})},
                                    {$project:{customer:1, charges:1}},
                                    {$group: {_id:'$customer._id', name: {$first: '$customer.name'}, code: {$first: '$customer.code'}, 'value':{$sum: "$charges.amount"}}},
                                    {$sort: {value:-1}},
                                    {$limit: 5}
                                ]
                                Contract.aggregate(pipeline, (err, records)=>{
                                    if (err){
                                        console.log(err);
                                    }
                                    else {
                                        outData[def.id] = records;
                                    }
                                    return cb();
                                }).read('secondary');
                            }
                            else if (def.id === 'top5CustomersByTickets') {
                                const Ticket = app.locals.models.Ticket;
                                let pipeline= [
                                    {$match: addAccessConditions({})},
                                    {$project:{customer:1}},
                                    {$group: {_id:'$customer._id', name: {$first: '$customer.name'}, code: {$first: '$customer.code'}, 'value':{$sum: 1}}},
                                    {$sort: {value:-1}},
                                    {$limit: 5}
                                ]
                                Ticket.aggregate(pipeline, (err, records)=>{
                                    if (err){
                                        console.log(err);
                                    }
                                    else {
                                        outData[def.id] = records;
                                    }
                                    return cb();
                                }).read('secondary');
                            }
                            // Model.find(dataDef.condition, dataDef.projection, dataDef.options, (err, records)=>{
                            //     if (err){
                            //         console.log(err);
                            //         return cb();
                            //     }
                            //     outData[def.id]= records;
                            //     return cb();
                            // });
                            break;
                    }
                });
            };

            const computeSectionWiseData = (section, next2)=>{
                const blocks = section.blocks;
                const computeBlockWiseData= (block, next3) =>{
                    if (!block.id){
                        console.log('block id does not exist - ',block.name);
                        return next3();
                    }
                    const populateItemsData = ()=>{
                        if (!block.items){
                            return next3();
                        }
                        const computeItemWiseData = (item, next4) =>{
                            getData(item,(err, data)=>{
                                if (err){
                                    return next4(err);
                                }
                                return next4();
                            });
                        };
                        Async.eachSeries(block.items, computeItemWiseData, (err)=>{
                            next3(err);
                        });
                    };

                    if (block.data) {
                        getData(block, (err, data)=>{
                            if (err){
                                return next3(err);
                            }
                            populateItemsData();
                        });
                    }
                    else {
                        populateItemsData();
                    }
                };
                Async.eachSeries(blocks, computeBlockWiseData, (err)=>{
                    if(err){
                        return next2(err);
                    }
                    return next2();
                });
            };

            const computePendingReasonsData= (doneCb) =>{
                const Ticket = app.locals.models.Ticket;
                let accessConditions= accessConditionsByCollection[Ticket.modelName];
                let addAccessConditions= (conditions) =>{
                    return {...conditions, ...accessConditions};
                }
                let pipeline= [
                    {$match: addAccessConditions({status: '03_on_hold', sType:{$nin:['pm']},holdReason: {$exists:true}})},
                    {$project:{holdReason:1}},
                    {$group: {_id:'$holdReason', 'value':{$sum: 1}}},
                ]
                Ticket.aggregate(pipeline, (err, records)=>{
                    console.log(records)
                    if (err){
                        console.log(err);
                    }
                    else {
                        if (records.length >0){
                            outData.pendingReasons = {
                                labels: Lodash.map(records, '_id'),
                                values: Lodash.map(records, 'value')
                            };
                        }
                    }
                    return doneCb();
                }).read('secondary');
            };

            Async.eachSeries(sections, computeSectionWiseData, (err)=>{
                if (err){
                    return res.error({error:err});
                }
                computePendingReasonsData((err)=>{
                    if (err){
                        return res.error({error:err});
                    }
                    res.success({ id: new Date().getTime(), data: outData, def: DashboardDef });
                });
            });
        }
    }

    return Dashboard;
};
