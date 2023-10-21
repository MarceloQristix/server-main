
const Async = require('async');
const FSExtra = require('fs-extra');

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Report extends AbstractCrud {
        constructor(groupPrefix) {
            super([groupPrefix, 'report'].join('/'), app.locals.models.Report,true);
            this.router.get('/', this.findAll.bind(this));
            this.router.get('/:id', this.findById.bind(this));
            this.router.post('/', this.createReport.bind(this));
            this.router.get('/open/:filename', this.downloadReport.bind(this));
            app.use(this.basePath, this.router);
        }

        createReport(req,res){
            /*
            1. Insert into Report collection, (name and status -> queued -> generating -> generated/failed)
            2. Generate Report and save in reports dir (opentickets-timestamp) as file
            3. Return the file url as response
            */
            const Report = app.locals.models.Report;
            const { reportType, filters } = req.body;
            const by= req.orgMe?.id || req.user?.id;
            let reportDoc = null;

            const insertReport = (next) => {
                Report.doCreate(by, { filters, rType: reportType}, (err, doc)=> {
                    if (err){
                        return next(err);
                    }
                    if (!doc){
                        return next('Could not create report entry');
                    }
                    reportDoc = doc;
                    return next();
                });
            };

            const generateReport = (next) => {
                reportDoc.generate(req.orgMe||req.user, next);
            };

            Async.series([
                insertReport,
                generateReport,
            ], (err) => {
                if (err) {
                    console.error(err);
                    return res.error({error: err});
                }
                return res.success({ id: reportDoc._id, name: reportDoc.name });
            });
        }

        downloadReport(req,res){
            const { filename } = req.params;
            const filePath = `${app.locals.dirs.reports}/${filename}`;
            FSExtra.pathExists(filePath, (err, exists)=>{
                if (err){
                    res.error('Some internal error occurred!');
                    return;
                }
                if(!exists){
                    res.status(404).send('not found!');
                    return;
                }
                res.download(filePath);
            });
        }
    }

    return Report;
};
