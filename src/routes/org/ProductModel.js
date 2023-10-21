module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class ProductModel extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'model'].join('/');
            super(basePath, app.locals.models.ProductModel);
        }

    }

    return ProductModel;
};
