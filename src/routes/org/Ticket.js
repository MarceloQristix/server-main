const Async = require('async');
const UserAgent = require('express-useragent');
const Mongoose= require('mongoose');

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Ticket extends AbstractCrud {

        constructor(groupPrefix) {
            let basePath= [groupPrefix, 'ticket'].join('/');
            super(basePath, app.locals.models.Ticket, true);
            this.router.post('/', this.create.bind(this));

            this.router.put('/:id/asset', this.updateAsset.bind(this));
            this.router.put('/:id/duedate', this.updateDueDate.bind(this));

            this.router.put('/assign-bulk', this.assignBulk.bind(this));
            this.router.put('/:id/assign', this.assign.bind(this));
            this.router.post('/:id/assign', this.assign.bind(this));

            this.router.put('/:id/start-work', this.startWork.bind(this));

            this.router.post('/:id/set-on-hold', this.setOnHold.bind(this));
            this.router.put('/:id/set-on-hold', this.setOnHold.bind(this));

            this.router.put('/:id/set-close', this.setClose.bind(this));
            this.router.put('/:id/set-close', this.setClose.bind(this));
            this.router.put('/:id/quick-close', this.quickClose.bind(this));
            this.router.put('/:id/quickClose', this.quickClose.bind(this));
            this.router.put('/:id/quickUpdate', this.quickUpdate.bind(this));

            this.router.put('/:id/cancel', this.cancel.bind(this));
            this.router.post('/:id/cancel', this.cancel.bind(this));

            this.router.put('/:id/job-sheet', this.generateJobSheet.bind(this));
            this.router.post('/:id/job-sheet', this.generateJobSheet.bind(this));

            //To be fixed
            this.router.put('/:id/map-asset', this.mapAsset.bind(this));
            this.router.patch('/:id/map-asset', this.mapAsset.bind(this));

            //Routes to be removed
            this.router.put('/:id/finish-work', this.finishWork.bind(this));
            this.router.put('/:id/pending', this.markPending.bind(this));
            this.router.post('/:id/pending', this.markPending.bind(this));
            this.router.post('/:id/close', this.close.bind(this));
            this.router.put('/:id/close', this.close.bind(this));

            //open routes
            this.router.get('/open', this.findAll.bind(this));
            this.router.post('/:id/get-charges-info', this.getChargesInfo.bind(this));
            this.router.put('/:id/get-charges-info', this.getChargesInfo.bind(this));

            this.setRoutes();
        }

        startWork(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.startWork(by,req.params.id, data, (err, record)=>{
                if (err){
                    res.error(err);
                }
                this.storeLocation(req);
                return res.success(record);
            });
        }

        finishWork(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.finishWork(by,req.params.id, data, (err, record)=>{
                if (err){
                    res.error(err);
                }
                this.storeLocation(req);
                return res.success(record);
            });
        }

        generateJobSheet(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.generateJobSheet(by, req.params.id, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }

        create(req,res) {
            const Asset = app.locals.models.Asset;            
            const data = { ...req.body };
            let tkt,asset;

            const loadAsset = next => {
                if (!data.asset){
                    return next();
                }
                Asset.findById(data.asset,(err,result) => {
                    if(err) return next(err);
                    asset = result;
                    return next();
                });
            };

            const createTicket = (next) => {
                const { role } = req.user;
                data.source = role === '_guest' ? 'customer_generated' : 'help_desk_created';
                if ((data.assignTo === 'self') && req.orgMe){
                    data.technicianId= req.orgMe._id;
                    if (req.orgMe._id && req.orgMe.id) {
                        data.technicianId= Mongoose.Types.ObjectId(req.orgMe.id);
                    }
                }
                if (asset){
                    data.asset = asset.toObject();
                    data.asset._id= asset._id;
                    data.customer = asset.customer;
                    data.address= asset.address;
                    if (!data.contact){
                        data.contact=asset.contact;
                    }
                }
                data.totalServiceCharge = data.services?.reduce((sum,item) => parseFloat(sum + item.price),0);
                let by = req.orgMe|| req.user;
                this.model.create(by,data,(err,result) => {
                    if(err) return next(err);
                    tkt = result;
                    return next();
                });
            };

            Async.series([
                loadAsset,                
                createTicket
            ],(err)=>{
                if (err) return res.error({error: err});
                return res.success(tkt);
            });
        }

        updateAsset(req,res){
            const Asset = app.locals.models.Asset;
            const Contract = app.locals.models.Contract;
            const ProductModel = app.locals.models.ProductModel;
            const data = { ...req.body.asset };
            let asset,productModel,ticket;

            const updateAsset = next => {
                Asset.updateBasicDetails(req.user.id,data.id,data,(err,record) => {
                    if(err) return next(err);
                    return next();
                });
            };

            const loadAsset = next => {
                Asset.findById(data.id,(err,result) => {
                    if(err) return next(err);
                    asset = result;
                    data.asset = result.getShortForm();
                    return next();
                });
            };

            const loadContract = next => {
                if(asset.contract._id){
                    Contract.findById(asset.contract._id,(err,result) => {
                        if(err) return next(err);
                        if(!result) return next({ message: 'Contract Not Found' });
                        data.asset.contract = { 
                            ...result.getShortForm(),
                            referenceNumber: result.referenceNumber,
                            status: result.status,
                            endDate: result.endDate
                        };
                        return next();
                    });
                }
                else{
                    return next();
                }
            };

            const loadProductModel = next => {
                ProductModel.findById(asset.model._id,(err,result) => {
                    if(err) return next(err);
                    if(!result) return next('No Product Found-1');
                    productModel = result.getShortForm();
                    productModel.meterTypes = result.meterTypes;
                    data.asset.model = productModel;
                    return next();
                });
            };
            
            const save= next =>{
                data.lastModifiedBy = req.orgMe._id;
                this.model.findByIdAndUpdate(req.params.id,data,{ new: true },(err,record) => {
                    if(err) {
                        return next(err);
                    }
                    ticket = record;
                    return next();
                });
            };

            Async.series([
                updateAsset,
                loadAsset,
                loadContract,
                loadProductModel,
                save
            ],(err)=>{
                if (err) return res.error({error: err});
                return res.success({ id: req.params.id, ...ticket._doc });
            });
        }

        updateDueDate(req, res){
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.updateDueDate(by,req.params.id, data, (err)=>{
                if (err){
                    res.error(err);
                }
                return res.success({ data });
            });
        }

        storeLocation(req){
            let source = req.headers['user-agent'],
                ua = UserAgent.parse(source);

            if (!ua.isMobile){
                return;
            }
            let longitude = req.headers['x-qloclongitude'];
            let latitude = req.headers['x-qloclatitude'];
            if (!latitude || !longitude){
                return;
            }
            console.log('LOCATION>>>>', longitude, latitude);
            this.model.mapLocation(req.orgMe||req.user, req.params.id, {loc: {lng:longitude,lat: latitude}});
        }

        markPending(req, res){
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.markPending(by,req.params.id, data, (err)=>{
                if (err){
                    res.error(err);
                }
                this.storeLocation(req);
                return res.success({ data });
            });
        }

        setOnHold(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.setOnHold(by,req.params.id, data, (err, record)=>{
                if (err){
                    res.error(err);
                }
                this.storeLocation(req);
                return res.success(record);
            });
        }

        setClose(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.closeV2(by,req.params.id, data, (err, record)=>{
                if (err){
                    res.error(err);
                }
                this.storeLocation(req);
                return res.success(record);
            });
        }

        quickClose(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.quickClose(by,req.params.id, data, (err, record)=>{
                this.storeLocation(req);
                this.sendUpdateResponse(req, res, err, record);
            });
        }

        quickUpdate(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.quickUpdate(by,req.params.id, data, (err, record)=>{
                this.storeLocation(req);
                this.sendUpdateResponse(req, res, err, record);
            });
        }

        cancel(req, res) {
            let data = req.body;
            let by = req.orgMe|| req.user;
            this.model.cancel(by,req.params.id,data, (err, record)=>{
                this.sendUpdateResponse(req, res, err, record);
            });
        }

        close(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.close(by, req.params.id, data,  (err, record)=>{
                this.storeLocation(req);
                this.sendUpdateResponse(req, res, err, record);
            });
        }

        mapAsset(req, res) {
            let data= req.body;
            let by = req.orgMe|| req.user;
            this.model.mapAsset(by, req.params.id, data,  (err, record)=>{
                this.storeLocation(req);
                this.sendUpdateResponse(req, res, err, record);
            });
        }

        assign(req, res){
            let data= req.body;
            let assigneeId= data.assignee._id;
            let by = req.orgMe|| req.user;
            this.model.assign(by, req.params.id, assigneeId,  (err, record)=>{
                this.sendUpdateResponse(req, res, err, record);
            });
        }

        assignBulk(req, res){
            let {assigneeId, ids}= req.body;
            let by = req.orgMe|| req.user;
            let updatedRecords= {};
            const doAssign= (id, next)=>{
                this.model.assign(by, id, assigneeId,  (err, record)=>{
                    if (err) {
                        console.log('assign error', err);
                        next(err);
                    }
                    updatedRecords[id]=record;
                    return next();
                });
            };
            Async.each(ids, doAssign, (err)=>{
                if (err){
                    return res.error(err);
                }
                res.success(updatedRecords);
            });
        }

        getChargesInfo(req, res) {
            this.model.getChargesInfo(req.user, req.params.id, req.body, (err, record)=>{
                if (err) {
                    console.log('get charges error', err);
                    res.error(err);
                }
                return res.success(record);
            });
        }

    }

    return Ticket;
};
