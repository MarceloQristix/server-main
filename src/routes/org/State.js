module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class State extends AbstractCrud {
        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'state'].join('/');
            super(basePath, app.locals.mainApp.locals.models.State,false);
            this.router.get('/', this.findAll.bind(this));
        }

        findAll(req, res) {
            console.log('in state findAll')
            let filter= {};
            if (req.query.filter) {
                try{
                    filter = JSON.parse(req.query.filter);
                }
                catch(e){
                    console.error(e);
                }
            }
            filter.country_code= app.locals.Settings.countryCode;
            req.query.filter= JSON.stringify(filter);
            return super.findAll(req, res);
        }
    }

    return State;
};
