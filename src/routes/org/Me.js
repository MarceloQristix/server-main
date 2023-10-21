
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Me extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'me'].join('/'), app.locals.models.Me, true);
            this.router.patch('/accept-usage-terms', this.acceptUsageTerms.bind(this));
            app.use(this.basePath, this.router);
        }

        acceptUsageTerms(req, res) {
            const OrgUser= app.locals.models.OrgUser;
            OrgUser.acceptUsageTerms(req.user.orgMe, req.user.orgMe._id, undefined,(err, record)=>{
                if (err){
                    res.error(err);
                    return;
                }
                res.success(record);
            });
        }

    }

    return Me;
};
