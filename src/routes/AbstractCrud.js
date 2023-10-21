const express = require('express');
const Mongoose = require('mongoose');
const Async= require('async');
const Moment= require('moment');

const K= require('../K');
const {getDataScopeAccessConditions} = require("../models/utils");

module.exports = function (app) {

    const Logger= app.locals.Logger;

    class AbstractCrud {
        constructor(basePath, model, dontSetRoutes=false) {
            const router = express.Router();
            this.router= router;
            this.basePath= basePath;
            if (!dontSetRoutes){
                this.setRoutes();
            }
            this.model = model;
            this.entityName= basePath.split('/')[basePath.split('/').length-1];
        }

        sendUpdateResponse(req, res, err, record) {
            if (err){
                return res.error(err);
            }
            return res.success(record);
        }

        setRoutes (dontSetDefault= false){
            let router= this.router;
            if (!dontSetDefault){
                router.get('/', this.findAll.bind(this));
                router.get('/:id', this.findById.bind(this));
                router.post('/', this.create.bind(this));
                router.patch('/:id', this.update.bind(this));
                router.put('/:id', this.update.bind(this));
                router.delete('/:id', this.remove.bind(this));
            }
            app.use(this.basePath, this.router);
        }

        findById(req, res) {
            this.model.QFindById(req.params.id)
                .then((doc) => {
                    res.success(doc);
                })
                .catch((err) => {
                    res.error(K.ERROR.SERVER_INTERNAL);
                    Logger.error(err);
                });
        }

        async findAll(req, res) {
            let filter= {}
            let range= [];
            let limit = req.query.limit||10;
            let sort = req.query.sort;
            let page = req.query.page||1;
            let user= req.user;
            if (req.query.filter) {
                try{
                    filter = JSON.parse(req.query.filter);
                }
                catch(e){
                    console.error(e);
                }
            }

            if (req.query.range) {
                try {
                    range= JSON.parse(req.query.range);
                    limit = (range[1]-range[0]+1)
                    page = ((Number(range[0])/limit)+1);
                }
                catch(e) {
                    console.log(e);
                }
            }

            const options = {
                page,
                limit,
                sort: {
                    createdOn:-1
                }
            };
            if (['asset', 'ticket'].indexOf(this.entityName) !== -1){
                delete options.sort;
            }
            if(sort){
                const sortParamsArray = JSON.parse(sort);
                if (Array.isArray(sortParamsArray)){
                    if (sortParamsArray[0] !== 'id'){
                        let sortObject = {};
                        sortObject[sortParamsArray[0]] = (sortParamsArray[1] === "ASC" ? 1 : -1);
                        if (sortObject.id){
                            sortObject= undefined;
                        }
                        options.sort = sortObject;
                    }
                }
                else {
                    if (Object.keys(sortParamsArray).length >0){
                        options.sort= sortParamsArray;
                    }
                }
            }            

            console.log('......=>', sort, options.sort)
            const prepareConditions= (next)=>{
                let orgMe= req.orgMe;
                if (this.entityName === 'org-user'){
                    if (filter.includeMe){
                        if (user.orgMe.role !== 'admin') {
                            filter.includeMe = user.orgMe.id;
                        }
                        else {
                            delete filter.includeMe;
                        }
                    }
                }
                if (filter.access?.resource === 'ticket'){
                    return next();
                }
                getDataScopeAccessConditions(app, this.entityName, orgMe, (err, conditions)=>{
                    if(err){
                        return next(err);
                    }
                    let f= conditions.filter;
                    let dataScope= conditions.dataScope;
                    for (let key in f){
                        filter[key]= f[key];
                    }
                    let pmConditions= [
                        {
                            sType: 'pm',
                            dueDate: {
                                $lte: Moment().add(7, 'days').endOf('day').toDate(),
                                $gte: Moment().subtract(7, 'days').startOf('day').toDate(),
                            }
                        },
                        {
                            sType: {$ne:'pm'}
                        }
                    ];
                    if (app.locals.Settings.ticket.showPastDuePM){
                        delete pmConditions[0]['dueDate']['$gte'];
                    }
                    //FIXME: This is hack
                    if (!filter.q){ //not a search
                        if(this.entityName === 'ticket'){
                            if (req.ua.isMobile && (!filter.sType||(filter.sType === 'pm'))){
                                filter['$or'] = pmConditions;
                            }
                            if (dataScope === 'self'){
                                if (!filter.status){
                                    filter.status = {$nin: ['05_closed','06_cancelled']};
                                }
                                options.limit=100;
                            }
                        }
                    }
                    return next();
                });
            };

            Async.series([prepareConditions], (err)=>{
                if (err){
                    console.log(err);
                    return res.error(K.ERROR.SERVER_INTERNAL);
                }
                this.model.paginate(filter, options)
                    .then((result) => {
                        let start = (result.page-1)* result.limit;
                        let end = start+result.docs.length;
                        let total = result.totalDocs;
                        res.header('X-Total-Count', total);
                        res.header('Content-Range', `records ${start}-${end}/${total}`);
                        res.success(result.docs);
                    })
                    .catch((err) => {
                        console.log(err);
                        res.error(K.ERROR.SERVER_INTERNAL);
                    });
            });
        }

        create(req, res) {
            const by= req.orgMe?._id||req.user._id||req.user.id;
            if (req.orgMe?.virtualRef?._id){
                return res.error('forbidden', {}, 403);
            }
            this.model.doCreate(by, req.body, (err, doc)=>{
                if (err){
                    console.log('error while creating', err);
                    res.error(K.ERROR.SERVER_INTERNAL, err);
                    return;
                }
                res.success(doc);
            });
        }

        update(req, res) {
            const by= req.orgMe?._id||req.user._id||req.user.id;
            if (req.orgMe?.virtualRef?._id){
                return res.error('forbidden', {}, 403);
            }
            this.model.doUpdate(by, req.params.id, req.body, (err, doc)=>{
                if (err){
                    res.error(K.ERROR.SERVER_INTERNAL, err);
                    return;
                }
                res.success(doc);
            });
        }

        remove(req, res) {
            const by= req.orgMe?._id||req.user._id||req.user.id;
            if (req.orgMe?.virtualRef?._id){
                return res.error('forbidden', {}, 403);
            }
            this.model.softDelete(by, req.params.id, (err, doc)=>{
                if (err){
                    res.error(K.ERROR.SERVER_INTERNAL, err);
                    return;
                }
                res.success(doc);
            });
        }

    }

    return AbstractCrud;
};
