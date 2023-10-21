
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);
    const ReportsDef = require('../../config/core/reports');

    class Profile extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'profile'].join('/'), app.locals.models.Profile, true);
            this.router.get('/', this.getProfile.bind(this));
            this.router.get('/:id', this.getProfile.bind(this));
            app.use(this.basePath, this.router);
        }

        getProfile(req, res) {
            console.log('>>>>Min Version:', app.locals.credentials.minClientVersion)
            let Settings= app.locals.Settings;
            let reportsDef= {};
            let ReportGroups= Settings.report.groups;
            ReportGroups.forEach((reportsGroup)=>{
                reportsGroup.types.forEach((id)=>{
                   reportsDef[id]= ReportsDef[id];
                });
            });
            res.success({...Settings,
                minClientVersion: app.locals.credentials.minClientVersion,
                googleMapsAPIKey: app.locals.credentials.googleMapsAPIKey,
                reportsDef,
                id:req.params.id});
        }

    }

    return Profile;
};
