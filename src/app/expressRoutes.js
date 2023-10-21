const CookieParser = require('cookie-parser');
const BodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
// const Cors = require('cors');

const Auth = require('./auth');

const init = (app, doneCb) => {

    const Config = app.locals.Config;
    const Logger = app.locals.Logger;
    const DEBUG= app.locals.credentials.debug||false;

    app.set('port', Config.get('apiServer.port'));
    app.set('debug', DEBUG);
    app.use(BodyParser.json({limit: "15mb"}));
    app.use(BodyParser.urlencoded({limit: "15mb", extended: false}));
    app.use(CookieParser());
    app.use(fileUpload({
        limits: { fileSize: 50 * 1024 * 1024 },
        useTempFiles : true,
        tempFileDir : '/tmp/'
    }));

    console.log('>>>>>routes set!');
    app.get('/health', function (req,res){
        res.status(200).send('Health OK!');
    });
    app.get('/', function (req, res){
        res.status(200).send('Index OK!');
    });

    const corsMiddleware = function (req, res, next) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Credentials', true);
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Content-Range, X-Requested-With, origin, accept, authorization, X-QLocLongitude, X-QLocLatitude');
        res.header('Access-Control-Expose-Headers', 'X-Total-Count, Content-Range');

        if (req.method == 'OPTIONS') {
            res.sendStatus(200);
        }
        else {
            next();
        }
    };
    app.use(corsMiddleware);
    // app.use(Cors());    //TODO: need to white list only specific domains, check why this is not working

    const resWrapperMiddleware = function (req, res, next) {
        res.success = function (data) {
            res.json(data);
        };
        res.error = function (error, data, status) {
            res.status(status||400).json({error, data});
            Logger.error(error);
        };
        return next();
    };
    app.use(resWrapperMiddleware);

    Auth.init(app, (err)=>{
        if (err){
            return doneCb(err);
        }
        const Routes = require('../routes/');
        Routes.init(app, 'global', (err) => {
            doneCb();
        });
    });
};

const init2 = (app, doneCb) => {
    const Logger = app.locals.Logger;

    // Catch unhandled urls and return 404
    app.use(function (req, res, next) {
        res.status(404).send('Not Found!');
    });

    // Default global error handler
    app.use(function (err, req, res, next) {
        Logger.error(err.stack);
        res.status(500).send('Something broke!');
    });
    return doneCb();
};

const shutdown = (app, doneCb) => {
    //Remove route handlers if needed.
    return doneCb();
};

module.exports = {
    init,
    init2,
    shutdown
};
