const Session = require('express-session');
const Passport = require('passport').Passport;
const Mongoose= require('mongoose');
const MongoStore = require('connect-mongodb-session')(Session);
const passportCustom= require('passport-custom');
const Moment = require("moment");
const CustomStrategy = passportCustom.Strategy;

const JwtStrategy = require('passport-jwt').Strategy,
    ExtractJwt = require('passport-jwt').ExtractJwt;

const init = function (app, doneCB) {

    const User = app.locals.models.User;
    const sessionSecret = app.locals.credentials.sessionSecret;

    const passport = new Passport();
    const sessionStore = new MongoStore({
        uri: app.locals.MONGODB_URL,
        collection: 'sessions',
        connectionOptions: app.locals.MONGODB_OPTIONS});
    sessionStore.on('error', (err)=>{
        console.error('error while initializing session store', err);
    });
    app.locals.sessionStore = sessionStore;

    app.use(passport.initialize());
    app.use(passport.session());
    // app.use(Session({
    //     store: sessionStore,
    //     secret: sessionSecret,
    //     resave: true,
    //     saveUninitialized: true,
	//     // cookie:{
    //     //     secure: true,
    //     //     sameSite: "none"
    //     // }
    // }));

    passport.use(User.createStrategy());
    const opts = {};
    opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
    opts.secretOrKey = app.locals.credentials.jwtSecret;
    // opts.issuer = 'accounts.qristix.com';
    // opts.audience = 'devqristix.com';
    passport.use(new JwtStrategy(opts, function(jwtPayload, done) {
        console.log('>>>>', "IN JWT ...");
        if (Date.now() > jwtPayload.expires) {
            return done('jwt expired');
        }
        User.findOne({_id: Mongoose.Types.ObjectId(jwtPayload.userId)}, function(err, user) {
            if (err) {
                return done(err, false);
            }
            if (user) {
                return done(null, user);
            }
            return done(null, false);
        });
    }));

    passport.use('otp', new CustomStrategy(
        function(req, done) {
            User.findOne({
                uniqueId: req.body.uniqueId
            }, function (err, user) {
                if (err){
                    return done('Internal Error! Try again later');
                }
                let otpError= undefined;
                if (req.body.otp !== user.otp){
                    otpError= 'Invalid OTP';
                }
                if ((Moment(user.otpExpiresOn).diff(new Date(), 's')<0)){
                    otpError= 'OTP Expired. Please regenerate and try new one';
                }
                done(otpError, user);
            });
        }
    ));

    passport.serializeUser(User.serializeUser());
    passport.deserializeUser(User.deserializeUser());
    app.locals.passport = passport;

    doneCB();
};

const shutdown = function (doneCB) {
    return doneCB();
};

module.exports= {
    init,
    shutdown
};
