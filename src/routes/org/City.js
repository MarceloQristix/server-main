module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class City extends AbstractCrud {
        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'city'].join('/');
            super(basePath, app.locals.mainApp.locals.models.City,false);
            this.router.get('/', this.findAll.bind(this));
        }

        findAll(req, res) {
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
    return City;
};
