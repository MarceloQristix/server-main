/**
 * @desc Mount routes which are accessible only by admins to manage
 *  our customers/organizations
 */

const init = function (app, doneCb) {
    app.use('/', function (req, res, next) {
        //TODO: check access privileges for the org api
        return next();
    });
    const OrgController = require('./core/Organization')(app);
    new OrgController('/core');
    const ApiDomainController = require('./core/ApiDomain')(app);
    new ApiDomainController('/core');
    return doneCb();
}

const shutdown = function () {

}

module.exports = {
    init,
    shutdown
};
