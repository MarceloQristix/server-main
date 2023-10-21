module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Accessory extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'part-requisition'].join('/'), app.locals.models.PartRequisition);
            this.router.put('/:id/fulfill',this.fulfill.bind(this));
            this.router.put('/:id/cancel',this.cancel.bind(this));
            this.router.put('/:id/material-requisition-form', this.generateMaterialRequisitionForm.bind(this));
            this.router.post('/:id/material-requisition-form', this.generateMaterialRequisitionForm.bind(this));
            this.router.post('/:id/update2', this.update2.bind(this));
            this.router.put('/:id/update2', this.update2.bind(this));
            this.router.put('/:id/put-on-hold', this.putOnHold.bind(this));
        }

        generateMaterialRequisitionForm(req, res) {
            let data= req.body;
            let by = req.user.orgMe|| req.user;
            this.model.generateMaterialRequisitionForm(by, req.params.id, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }

        putOnHold(req, res){
            let data= req.body;
            let by = req.user.orgMe|| req.user;
            this.model.putOnHold(by, req.params.id, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }

        update2(req, res){
            let data= req.body;
            let by = req.user.orgMe|| req.user;
            this.model.update2(by, req.params.id, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }
        fulfill(req,res){
            let id = req.params.id;
            let by = req.user.orgMe|| req.user;
            this.model.fulfill(by,id,req.body,this.sendUpdateResponse.bind(this, req, res));
        }

        cancel(req,res){
            let id = req.params.id;
            let by = req.user.orgMe|| req.user;
            this.model.cancel(by,id,req.body,this.sendUpdateResponse.bind(this, req, res));
        }

    }

    return Accessory;
};
