module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class OrgUnitRunningStats extends AbstractCrud {
        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'orgUnitRunningStats'].join('/');
            super(basePath, app.locals.models.OrgUnitRunningStats,false);
        }
    }

    return OrgUnitRunningStats;
};
