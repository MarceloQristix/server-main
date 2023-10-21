const Async = require("async");
const Path = require('path');
const FS = require("fs-extra");
const { ToWords } = require('to-words');

const OrgServices = require('../../services/org');

const K = require('../../K');
const Db = require("./db");

module.exports = function (app, mode, doneCb) {

    const Config = app.locals.Config;   //global config
    const Logger = app.locals.Logger;

    app.disable('verbose errors');

    const initi18n= (next)=>{
        if (!app.locals.services) {
            app.locals.services= {};
        }
        app.locals.services.ToWords= new ToWords({
            localeCode: app.locals.Settings.i18n.localeCode,
        });
        return next();
    }

    const initDb = (next) => {
        Db.init(app, mode, next);
    };

    const createDataDirs = (next) => {
        let orgDataDir = Config.get('orgDataDir');
        let dataDirPath = Path.join(app.locals.rootDir, orgDataDir, app.locals.id.toString());

        Logger.info(`Data Dir - ${dataDirPath}`);
        app.locals.dataDir= dataDirPath;
        let dirs = {
            assets : 'assets',
            qrcodes : 'assets/qrcodes',
            sites   : 'sites',
            sitesFiles: 'sites/files/',
            campaigns: 'campaigns',
            campaignMedia: 'campaigns/media',
            sitesQRCodes : 'sites/qrcodes',
            masters : 'masters',
            tickets : 'tickets',
            reports : 'reports',
            partReqs: 'partReqs',
            pages   : 'pages',
            campaigns: 'campaigns'
        };
        app.locals.dirs = {};
        FS.mkdirpSync(dataDirPath);
        for (let dirId in dirs) {
            let dirName = dirs[dirId];
            let dirPath = Path.join(dataDirPath, dirName);
            FS.mkdirpSync(dirPath);
            app.locals.dirs[dirId] = dirPath;
        }
        return next();
    };

    const loadAdmin = (next) => {
        const mainApp= app.locals.mainApp;
        const User = mainApp.locals.models.User;
        User.findOne({role:{$in:['_admin', 'admin']}, ownedOrgs:{$in: app.locals._id}}, function (err, record){
            if (err){
                return next(err);
            }
            app.locals.admin = record||mainApp.locals.sysUser;
            return next();
        });
    };

    const initializeServices = (next) =>{
        OrgServices.init(app, next);
    };

    const setupRoutes = (next) => {
        // require("routes/api")(app);
        // app.set("port", Config.get('apiServer.port'));
        // app.set('debug', Config.get('debug'));
        // app.use(BodyParser.json({limit:"2mb"}));
        // app.use(BodyParser.urlencoded({limit:"2mb", extended: false }));
        // app.use(CookieParser());

        const Routes = require('../../routes/');
        Routes.init(app, 'org', (err) => {
            return next(err);
        });
    };

    const loadData = (next) => {
        const sysUser = app.locals.sysUser;
        //TODO: populate settings and any other default data
        return next();
    };

    const execTask = (next) =>{
        let task = process.argv[3];
        if (task.indexOf('/') === -1){
            task= 'tasks/'+task;
        }
        require(`../../${task}`)(app, (err)=>{
            if (err){
                console.error('Error executing task - ',task);
            }
            else {
                console.log('Successfully completed executing task - ', task)
            }
            next();
        });
    };

    const createRootOrgUnitIfNotExists= (next) =>{
        const OrgUnit= app.locals.models.OrgUnit;
        OrgUnit.createRootIfNotExists(app.locals.admin, next);
    };

    const steps = [
        initi18n,
        initDb,
        createDataDirs,
        loadAdmin,
        loadData,
        initializeServices,
        createRootOrgUnitIfNotExists
    ];

    switch (mode) {
        case K.RUN_MODE.BUSINESS_API:
            steps.push(setupRoutes);
            break;
        case K.RUN_MODE.WORKER:
            break;
        case K.RUN_MODE.EXEC_ONCE:
            steps.push(execTask);
            break;
        case K.RUN_MODE.MANAGE_API: //TODO: Not yet implemented
            break;
    }

    Async.series(steps, function (err) {
        doneCb(err);
    });

    app.locals.shutdown = (cb) => {
        Db.shutdown(app, cb);
    };
};
