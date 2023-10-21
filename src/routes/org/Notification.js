const K = require("../../K");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Notification extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath = [groupPrefix, 'notification'].join('/');
            super(basePath, app.locals.models.Notification, true);
            this.router.put('/:id/update-opened-at', this.updatedOpenedAt.bind(this));
            this.setRoutes();
        }


        updatedOpenedAt(req, res){
            const by= req.orgMe|| req.user;
            this.model.updateOpenedAt(by, req.params.id, req.body, (err, doc)=>{
                if (err){
                    console.log(err);
                    res.error(K.ERROR.SERVER_INTERNAL, err);
                    return;
                }
                res.success(doc);
            });
        }

    }
    return Notification;
};
