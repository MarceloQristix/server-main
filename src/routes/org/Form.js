
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Form extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath = [groupPrefix, 'form'].join('/');
            super(basePath, app.locals.models.Form, false);
        }
    }
    return Form;
};
