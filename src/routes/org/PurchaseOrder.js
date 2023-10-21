module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class PurchaseOrder extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'purchase-order'].join('/'), app.locals.models.PurchaseOrder);
        }

    }

    return PurchaseOrder;
};
