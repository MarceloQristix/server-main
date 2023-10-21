
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Product extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'product'].join('/'), app.locals.models.Product);
        }

    }

    return Product;
};
