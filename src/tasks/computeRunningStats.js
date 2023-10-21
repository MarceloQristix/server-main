
const Async = require('async');

module.exports = async function (app, doneCb){
    const OrgUnitRunningStats= app.locals.models.OrgUnitRunningStats;
    await OrgUnitRunningStats.computeStats(app.locals.admin);
    doneCb();
}
