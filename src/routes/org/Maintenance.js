const K = require("../../K");
const Mongoose = require('mongoose');

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Maintenance extends AbstractCrud {
        constructor(groupPrefix) {
            super([groupPrefix, 'maintenance'].join('/'), app.locals.models.Ticket,true);
            this.router.get('/', this.getTickets.bind(this));
            app.use(this.basePath, this.router);
        }

        getTickets(req,res){
            const filter = JSON.parse(req.query.filter);
            const condition = { sType: 'pm',status: { $ne: '05_closed' }};
            const group = { 
                _id: { month: { $month: { date: '$dueDate', timezone: '+0530' } } },
                events: { $push: {
                        id: '$_id',
                        code: '$code',
                        date: '$dueDate',
                        type: '$sType',
                        assignee: '$assignee',
                        asset: '$asset',
                        customer:'$customer',
                        contract: '$contract'
                    }
                }
            };
            const sort = { '_id.month': 1 };
            if(filter.customerId){
                condition['customer._id'] = Mongoose.Types.ObjectId(filter.customerId);
            }
            if(filter.contractId){
                condition['contract._id'] = Mongoose.Types.ObjectId(filter.contractId);
            }
            if(filter.assetId){
                condition['asset._id'] = Mongoose.Types.ObjectId(filter.assetId);
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
