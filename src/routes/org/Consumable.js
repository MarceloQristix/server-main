
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Consumable extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'consumable'].join('/'), app.locals.models.Consumable);
        }

    }

    return Consumable;
};
