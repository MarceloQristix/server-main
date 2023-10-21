const Async = require('async');
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Customer extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'customer'].join('/');
            super(basePath, app.locals.models.Customer, true);
            this.router.put('/:id/asset', this.addAssets.bind(this));
            this.router.put('/:id/asset/remove',this.removeAsset.bind(this));
            this.router.put('/:id/status',this.updateStatus.bind(this));
            this.router.put('/:id/rate-card',this.addRateCard.bind(this));
            this.router.put('/:id/activate',this.activate.bind(this));
            this.router.put('/:id/deactivate',this.deactivate.bind(this));
            this.setRoutes();
        }

        addAssets(req, res){
            let id = req.params.id;
            let by= req.user;
            this.model.addAssets(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        removeAsset(req,res){
            const Asset = app.locals.models.Asset;
            const Customer = this.model;
            const { asset } = req.body;
            const { id } = req.params;
            let assetData;
            let customer;
            
            const loadAsset = next => {
                Asset.findById(asset, (err,doc) => {
                    if(err) return next(err);
                    if(!doc) return next('Asset Not Found');
                    assetData = doc;
                    return next();                    
                });
            };

            const updateAsset = next => {
                assetData.customer = {};
                assetData.contact = {};
                if(!assetData.site?._id){
                    assetData.address = {};
                }
                assetData.save(next);
            };

            const updateCustomer = next => {
                Customer.findByIdAndUpdate(id,{ $inc: {numAssets: -1} }, err => {
                    if(err) return next(err);
                    return next();
                });
            };

            const loadCustomer= (next) =>{
                Customer.findById(id, (err, record)=>{
                    customer= record;
                    return next();
                });
            };

            Async.series([
                loadAsset,
                updateAsset,
                updateCustomer,
                loadCustomer
            ],(err)=>{
                if (err) return res.error({error: err});
                return res.success(customer);
            });
        };

        addRateCard(req,res){
            const { id } = req.params;
            const by = req.user;
            this.model.addRateCard(by,id,req.body,(err,result) => {
                if(err) return res.error({ error: err });
                return res.success({ id });
            });
        }

        updateStatus(req,res){
            const { id } = req.params;
            const { flag } = req.body;
            this.model.updateStatus(id,flag,(error) => {
                if (error) return res.error({ error });
                return res.success({ id });
            });
        }

        activate(req,res){
            const { id } = req.params;
            const by = req.orgMe||req.user;
            this.model.activate(by, id, req.body, (error,record) => {
                this.sendUpdateResponse(req, res, error, record);
            });
        }

        deactivate(req,res){
            const { id } = req.params;
            const by = req.orgMe||req.user;
            this.model.deactivate(by, id, req.body, (error, record) => {
                this.sendUpdateResponse(req, res, error, record);
            });
        }


    }

    return Customer;
};
