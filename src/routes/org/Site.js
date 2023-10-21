const Async = require("async");
module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class Site extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'site'].join('/');
            super(basePath, app.locals.models.Site,true);
            this.router.put('/:id/asset', this.tagAsset.bind(this));
            this.router.put('/:id/asset/remove',this.removeAsset.bind(this));
            this.router.put('/:id/customer', this.tagCustomer.bind(this));
            this.router.put('/:id/customer/remove', this.removeCustomer.bind(this));
            this.router.put('/:id/consumables', this.addConsumable.bind(this));
            this.router.put('/:id/consumables/update', this.updateConsumable.bind(this));
            this.router.put('/:id/register-ticket', this.registerTicket.bind(this));
            this.router.put('/:id/register-ticket-protected', this.registerTicket.bind(this));
            this.setRoutes();
        }

        registerTicket(req, res) {
            const by = req.user?.orgMe|| req.user;
            const Ticket = app.locals.models.Ticket;
            const data = {...req.body};
            let tkt = undefined;

            const createTicket = (next) => {
                const { role } = req.user;
                data.source = role === '_guest' ? 'customer_generated' : 'help_desk_created';
                Ticket.create(by, data, (err, doc) => {
                    if (err){
                        return next(err);
                    }
                    tkt = doc;
                    return next();
                });
            };

            let steps= [
                createTicket,
            ];
            Async.series(steps, (err)=>{
                if (err){
                    return res.error({error: err});
                }
                return res.success(tkt);
            });
        }

        tagAsset(req,res){
            let id = req.params.id;
            let by = req.user;
            this.model.addAssets(by,id,req.body,(err,result) => {
                if (err) return res.error({error: err});
                return res.success({ id, ...result });
            });
        }

        removeAsset(req,res){
            let id = req.params.id;
            let by = req.user;
            this.model.removeAsset(by,id,req.body,(err,result) => {
                if (err) return res.error({error: err});
                return res.success({ id, ...result });
            });
        }

        tagCustomer(req,res){
            const id = req.params.id;
            const by = req.user;
            this.model.addCustomer(by,id,req.body,(err) => {
                if (err) return res.error({ error: err });
                return res.success({ id, ...req.body });
            });
        }

        removeCustomer(req,res){
            const id = req.params.id;
            const by = req.user;
            this.model.removeCustomer(by,id,(err) => {
                if(err) return res.error({ error: err });
                return res.success({ id });
            });
        }

        addConsumable(req,res){
            const id = req.params.id;
            this.model.addConsumable(id,req.body,(err,result) => {
                if(err) return res.error({ error: err });
                return res.success({ id, ...result });
            });
        }

        updateConsumable(req,res){
            const id = req.params.id;
            this.model.updateConsumable(id,req.body,(err,result) => {
                if(err) return res.error({ error: err });
                return res.success({ id });
            });
        }
    }

    return Site;
};
