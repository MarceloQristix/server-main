
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Campaign extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath = [groupPrefix, 'campaign'].join('/');
            super(basePath, app.locals.models.Campaign, false);
            this.router.put('/:id/send', this.send.bind(this));
            this.router.put('/:id/send2Enquiries', this.send2Enquiries.bind(this));


        }

        sendUpdateResponse(req, res, err, record) {
            if (err){
                return res.error(err);
            }
            return res.success(record);
        }

        send(req, res){
            let id = req.params.id;
            let by= req.user;
            this.model.send(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        send2Enquiries(req, res){
            let id = req.params.id;
            let by= req.user;
            let data= req.body;
            data.type= 'enquiry';
            this.model.send(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

    }
    return Campaign;
};
