module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class Vendor extends AbstractCrud {
        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'cluster'].join('/');
            super(basePath, app.locals.models.Cluster,false);
        }
    }

    return Vendor;
};
