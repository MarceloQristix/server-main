
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class OrgUnit extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'org-unit'].join('/'), app.locals.models.OrgUnit);
            // this.router.post()
        }

    }

    return OrgUnit;
};
