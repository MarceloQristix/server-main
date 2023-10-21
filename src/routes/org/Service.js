module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class Service extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'service'].join('/');
            super(basePath, app.locals.models.Service,false);
        }

    }

    return Service;
};
