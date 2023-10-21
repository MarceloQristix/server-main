
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class SparePart extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'spare-part'].join('/');
            super(basePath, app.locals.models.SparePart);
        }

    }

    return SparePart;
};
