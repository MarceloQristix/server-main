module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class RateCard extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'rate-card'].join('/');
            super(basePath, app.locals.models.RateCard,true);
            this.router.put('/:id/default/add', this.markDefault.bind(this));
            this.router.put('/:id/default/remove', this.removeDefault.bind(this));
            this.router.put('/:id/customer/add', this.addCustomers.bind(this));
            this.setRoutes();

        }

        addCustomers(req, res) {
            const id = req.params.id;
            this.model.addCustomers(id,req.body,(err, record) => {
                if(err) {
                    return res.error({ error: err });
                }
                return res.success(record);
            });
        }
        
        markDefault(req,res){
            const id = req.params.id;
            this.model.markDefault(id,true,(err) => {
                if(err) return res.error({ error: err });
                return res.success({ id });
            });
        }

        removeDefault(req,res){
            const id = req.params.id;
            this.model.markDefault(id,false,(err) => {
                if(err) return res.error({ error: err });
                return res.success({ id });
            });
        }

    }

    return RateCard;
};
