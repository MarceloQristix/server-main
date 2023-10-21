const Mongoose= require('mongoose');

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class File extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'file'].join('/'), app.locals.models.File, true);
            this.router.post('/',this.handleFileUpload.bind(this));
            this.router.delete('/:id', this.deleteFile.bind(this));
            this.router.get('/', this.findAll.bind(this));
            this.setRoutes(true);
        }

        handleFileUpload(req, res) {
            let data= {...Object.values(req.files)[0]};
            data.ref= {
                rType: req.body.rType
            };
            if (req.query.refId){
                data.ref._id= Mongoose.Types.ObjectId(req.query.refId);
            }

            this.model.saveFile(req.user, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }

        deleteFile(req, res) {
            this.model.deleteFile(req.user, req.params.id, {}, (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }
    }

    return File;
};
