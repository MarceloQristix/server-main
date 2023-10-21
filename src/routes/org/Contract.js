const K = require("../../K");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Contract extends AbstractCrud {

        constructor(groupPrefix) {
            let basePath = [groupPrefix, 'contract'].join('/');
            super(basePath, app.locals.models.Contract, true);

            //Default routes
            this.router.get('/', this.findAll.bind(this));
            this.router.get('/:id', this.findById.bind(this));
            this.router.post('/', this.create.bind(this));
            this.router.patch('/:id', this.update.bind(this));
            this.router.put('/:id', this.update.bind(this));
            this.router.delete('/:id', this.remove.bind(this));

            //additional routes
            this.router.put('/:id/cancel', this.cancel.bind(this));
            this.router.put('/:id/asset-next-pm', this.generateNextPM4Asset.bind(this));
            this.router.put('/:id/set-schedule-day-preference', this.setScheduleDayPreference.bind(this));
            this.router.put('/:id/note-initial-meter-readings', this.noteInitialMeterReadings.bind(this));

            app.use(this.basePath, this.router);
        }

        sendUpdateResponse(req, res, err, record) {
            if (err){
                return res.error(err);
            }
            console.log('sending resp:', req.url,  record);
            return res.success(record);
        }

        cancel(req, res) {
            let id = req.params.id;
            let by= req.user;
            this.model.cancel(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        generateNextPM4Asset(req, res) {
            let id = req.params.id;
            let by= req.user;
            this.model.generateNextPM4Asset(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        setScheduleDayPreference(req, res) {
            let id = req.params.id;
            let by= req.user;
            this.model.setScheduleDayPreference(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        noteInitialMeterReadings(req, res) {
            let id = req.params.id;
            let by= req.user;
            this.model.noteInitialMeterReadings(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }
    }

    return Contract;
};
