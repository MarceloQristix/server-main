
module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);
    class Attendance extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'attendance'].join('/');
            super(basePath, app.locals.models.Attendance,true);
            this.router.put('/:id/punch-in', this.punchIn.bind(this));
            this.router.put('/:id/punch-out', this.punchOut.bind(this));
            this.router.patch('/:id/punch-in', this.punchIn.bind(this));
            this.router.patch('/:id/punch-out', this.punchOut.bind(this));
            this.setRoutes();
        }

        punchIn(req,res){
            this.model.punchIn(req.orgMe||req.user, req.body, (err, result) => {
                if (err) {
                    return res.success({id:1110});
                    // return res.error({error: err});
                }
                return res.success(result);
            });
        }

        punchOut(req,res){
            this.model.punchOut(req.orgMe||req.user, req.body, (err,result) => {
                if (err) {
                    return res.error({error: err});
                }
                return res.success(result);
            });
        }
        
    }

    return Attendance;
};
