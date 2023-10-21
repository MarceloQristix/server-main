/**
 * @desc Initializes express routes
 */

const Mongoose= require('mongoose');
const RequestIp = require('request-ip');
const UserAgent = require("express-useragent");

/**
 *
 * @param app
 * @param group
 * @param doneCb
 * @returns {*}
 */
const init = function (app, group, doneCb) {

    if (group === 'org') {
        require('./org/index')(app, doneCb);
    }
    else if (group === 'global') {
        app.get('/health', function (req, res) {
            res.status(200).send('Health OK!');
        });
        app.get('/api/health', function (req, res) {
            res.status(200).send('API Health OK!');
        });

        app.use("/api/global", function (req, res, next) {
            //TODO: check access privileges for api
            return next();
        });

        let populateContext= function (req, res, next) {
            let client = {
                ua: req.get('User-Agent'),
                v: req.query._v
            };
            req.body._client = client;

            let source = req.headers['user-agent'],
                ua = UserAgent.parse(source);
            req.ua= ua;
            req.client= {
                ua: ua,
                ipAddress: RequestIp.getClientIp(req),
                appVersion: req.headers['x-app-version']
            };
            req.body.client= {...client};

            let longitude = req.headers['x-qloclongitude'];
            let latitude = req.headers['x-qloclatitude'];

            if (latitude &&longitude){
                req.loc= {
                    lng:longitude,
                    lat: latitude
                }
                req.body.loc= {...req.loc};
            }

            req.isLoggedin = function () {
                return (req.user&& req.user.role !=='_guest')? true: false;
            };
            // console.log('user login check>>>', req.user, req.session);
            if (!req.isLoggedin()) {
                return next();
            }
            if (!req.user && req.session?.passport?.user?.id){
                req.user= req.session?.passport?.user;
            }
            if (req.user){
                if (req.user.id&& !req.user._id){
                    req.user._id= Mongoose.Types.ObjectId(req.user.id);
                }
                return next();
            }
            console.log('>>>>', req.path, req.user.uniqueId);
            return next();
        };

        let skipAuth = function(req,res,next) {
            req.isWhitelistUrl= true;
            if (req.params.orgId) {
                req.orgId= req.params.orgId;
            }
            console.log('skipping auth for', req.path);
            return next();
        };

        let checkAuth = function (req, res, next) {
            console.log('>>checking for auth', req.path);
            if (!req.isWhitelistUrl) {
                console.log('authorization required >>>', req.path);
                app.locals.passport.authenticate("jwt", {session: true})(req, res,next);
                return;
            }
            console.log('authenticating user for ', req.path);
            app.locals.passport.authenticate("jwt", {session: true}, function (err, account){
                if (!err){
                    if (account && account._doc){   //account comes as false in some cases (especially open urls
                        req.user= {...account._doc};
                    }
                }
                if (req.user){
                    return next();// populateContext(req, res, next);
                }
                if (req.path.indexOf('main') !== -1){
                    return next();
                }
                const User = app.locals.models.User;
                const Organization= app.locals.models.Organization;
                const orgId= req.orgId;
                Organization.findOne({seqId: orgId}, (err, org)=>{
                    if(err){
                        return next(err);
                    }
                    if (!org){
                        return next(`invalid org : ${orgId}`)
                    }
                    User.findOne({role:'_guest', memberOrgs:{$in:[org._id]}}, (err, guest)=>{
                        if (err){
                            return next(err)
                        }
                        if (!guest){
                            return next('Guest user not found!');
                        }
                        req.user= guest;
                        return next();
                    });
                });
            })(req,res);
            return;
        }

        //whitelist
        app.use('/api/main/contact/get-started', skipAuth);
        app.use('/api/main/contact/get-in-touch', skipAuth);
        app.use('/api/main/misc/state', skipAuth);
        app.use('/api/main/misc/city', skipAuth);
        app.use('/api/main/account/login', skipAuth);
        app.use('/api/main/account/otp', skipAuth);
        app.use('/api/main/account/reset-password', skipAuth);

        app.get('/api/org/:orgId/profile', skipAuth);
        app.get('/api/org/:orgId/asset', skipAuth);
        app.use('/api/org/:orgId/asset/:id', skipAuth);
        app.get('/api/org/:orgId/site/:id', skipAuth);
        app.put('/api/org/:orgId/site/:id/register-ticket', skipAuth);
        app.get('/api/org/:orgId/profile/:id', skipAuth);
        app.get('/api/org/:orgId/product', skipAuth);
        app.get('/api/org/:orgId/model', skipAuth);
        app.get('/api/org/:orgId/consumable', skipAuth);
        app.get('/api/org/:orgId/accessory', skipAuth);
        app.get('/api/org/:orgId/common-problem', skipAuth);
        app.post('/api/org/:orgId/customer', skipAuth);
        app.get('/api/org/:orgId/customer', skipAuth);
        app.get('/api/org/:orgId/ticket/open', skipAuth);
        app.get('/api/org/:orgId/customer/:id', skipAuth);
        app.get('/api/org/:orgId/rate-card', skipAuth)
        app.get('/api/org/:orgId/sku', skipAuth);
        app.get('/api/org/:orgId/sku/:id', skipAuth);
        app.get('/api/org/:orgId/site/:id', skipAuth);
        app.get('/api/org/:orgId/report/open/:id', skipAuth);
        app.get('/api/org/:orgId/page/:id', skipAuth);
        app.get('/api/org/:orgId/notification/:id', skipAuth);
        app.put('/api/org/:orgId/notification/:id/update-opened-at', skipAuth);
        app.get('/api/org/:orgId/campaign/:id', skipAuth);
        app.get('/api/org/:orgId/enquiry/draft/data', skipAuth);
        app.put('/api/org/:orgId/enquiry/draft/send-verification-code', skipAuth);
        app.put('/api/org/:orgId/enquiry/:id/verify-otp-update', skipAuth);


        //Website form submission routes
        app.use('/api/main/contact', require('./main/Contact')(app));
        app.use('/api/main/misc', require('./main/Misc')(app));

        //check Authorizations
        app.use('/api', checkAuth, populateContext);
        app.use('/api/main/account', require('./main/Account')(app));

        return doneCb();
    }
};

const trimRight = function (str, trimStr){
    let lastIndex = str.lastIndexOf(trimStr);
    if (lastIndex+ trimStr.length !== str.length){
        return  str;
    }
    return  str.substr(0, str.length-trimStr.length);
}

const shutdown = function (app, doneCb) {
    return doneCb();
};

module.exports = {
    init,
    shutdown
};
