
module.exports = function (app, doneCb){
    console.log('Running Reports Cleanup...', new Date());
    const Report= app.locals.models.Report;
    Report.purgeOld(doneCb);
}
