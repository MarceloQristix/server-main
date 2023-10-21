
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Organization extends AbstractCrud {
        constructor(groupPrefix) {
            super([groupPrefix, 'organization'].join('/'), app.locals.models.Organization);
        }

    }

    return Organization;
};
