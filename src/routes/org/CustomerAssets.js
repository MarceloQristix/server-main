const K = require("../../K");
const Mongoose = require('mongoose');

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Maintenance extends AbstractCrud {
        constructor(groupPrefix) {
            super([groupPrefix, 'customer-assets'].join('/'), app.locals.models.Asset,true);
            this.router.get('/:id', this.getById.bind(this));
            app.use(this.basePath, this.router);
        }

        getById(req,res){
            const filter = JSON.parse(req.query.filter);
            const hasMeters = app.locals.Settings.model.hasMeters;
            const customerId= req.params.id;
            const condition = { };
            const group = { 
                _id: { month: { $month: { date: '$dueDate', timezone: '+0530' } } },
                events: { $push: 
                    { date: '$dueDate', type: '$sType', assignee: '$assignee', asset: '$asset', customer:'$customer' }
                }
            };
            const sort = { '_id.month': 1 };
            if(filter.customerId){
                condition['customer._id'] = Mongoose.Types.ObjectId(filter.customerId);
            }
            this.model.aggregate([{ $match: condition },{ $group: group },{ $sort: sort }])
            .then((doc) => {
                for(let item of doc){
                    item.id = item._id.month;
                }
                let start = 0;
                let end = doc.length-1;
                let total = doc.length;
                res.header('X-Total-Count', total);
                res.header('Content-Range', `records ${start}-${end}/${total}`);
                res.success(doc);
            })
            .catch(err => {
                return res.error({...K.ERROR.SERVER_INTERNAL,details:err});
            });
        };
        
    }

    return Maintenance;
};
