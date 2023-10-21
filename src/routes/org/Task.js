const Mongoose = require("mongoose");
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Task extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'task'].join('/'), app.locals.models.Task, true);
            this.router.post('/', this.createTask.bind(this));
            this.router.put('/:id/dry-run', this.dryRun.bind(this));
            this.router.put('/:id/commit', this.commit.bind(this));
            this.router.get('/', this.findAll.bind(this));
            this.setRoutes()
        }

        createTask(req, res) {
            let data= req.body||{};
            const by= req.orgMe||req.user;
            if (req.files){
                data.file= {...Object.values(req.files)[0]};
            }
            this.model.createAndExecTask(by, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                if (result.type === 'sendAssetStatusUpdate'){
                    setTimeout(()=>{
                        result.commit(by,()=>{

                        });
                    },3000);
                }
                return res.success(result);
            });
        }

        dryRun(req, res) {
            let data= req.body||{};
            this.model.dryRun(req.orgMe||req.user, req.params.id, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }

        commit(req, res) {
            let data= req.body||{};
            this.model.commit(req.orgMe||req.user, req.params.id, data,  (err, result)=>{
                if (err){
                    return res.error(err);
                }
                return res.success(result);
            });
        }

    }

    return Task;
};
