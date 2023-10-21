const Async = require('async');
const K = require("../../K");
const Validator = require("validator");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class OrgUser extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'org-user'].join('/');
            super(basePath, app.locals.models.OrgUser, true);
            this.router.put('/:id/updatePasswd', this.updatePassword.bind(this));
            this.router.put('/:id/activate', this.activate.bind(this));
            this.router.put('/:id/deactivate', this.deactivate.bind(this));
            this.router.put('/:id/send-welcome-email', this.sendWelcomeEmail.bind(this));
            this.setRoutes();
        }

        activate(req, res){
            const by= req.orgMe|| req.user;
            this.model.activate(by, req.params.id, req.body, (err, doc)=>{
                if (err){
                    res.error(K.ERROR.SERVER_INTERNAL, err);
                    return;
                }
                res.success(doc);
            });
        }

        deactivate(req, res) {
            const by= req.orgMe|| req.user;
            this.model.block(by, req.params.id, req.body, (err, doc)=>{
                if (err){
                    res.error(K.ERROR.SERVER_INTERNAL, err);
                    return;
                }
                res.success(doc);
            });
        }

        updatePassword (req,res) {
            const by = req.user.id;
            this.model.updatePassword(by,req.params.id,req.body, (err, doc)=>{
                if(err) return res.error(K.ERROR.SERVER_INTERNAL, err);
                return res.success(doc);
            });
        }

        sendWelcomeEmail(req, res) {
            let by= req.orgMe|| req.user;
            this.model.sendWelcomeEmail(by, req.params.id,req.body, (err, doc)=>{
                if(err) return res.error(K.ERROR.SERVER_INTERNAL, err);
                return res.success(doc);
            });
        }
    }

    return OrgUser;
};
