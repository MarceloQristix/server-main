
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class ProductCategory extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'product-category'].join('/');
            super(basePath, app.locals.models.ProductCategory);
        }

    }

    return ProductCategory;
};
