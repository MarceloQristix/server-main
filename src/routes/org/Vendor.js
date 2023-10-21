module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class Vendor extends AbstractCrud {
        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'vendor'].join('/');
            super(basePath, app.locals.models.Vendor,false);
        }
    }

    return Vendor;
};
