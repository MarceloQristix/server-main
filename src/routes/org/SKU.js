module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class Vendor extends AbstractCrud {
        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'sku'].join('/');
            super(basePath, app.locals.models.SKU,false);
        }
    }

    return Vendor;
};
