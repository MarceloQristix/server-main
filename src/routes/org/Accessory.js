module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Accessory extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'accessory'].join('/'), app.locals.models.Accessory);
        }

    }

    return Accessory;
};
