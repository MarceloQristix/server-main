
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class MeterType extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'meter-type'].join('/');
            super(basePath, app.locals.models.MeterType);
        }

    }

    return MeterType;
};
