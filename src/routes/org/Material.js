const Async = require("async");
const K = require("../../K");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Material extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'material'].join('/');
            super(basePath, app.locals.models.SparePart, true);
            this.router.get('/', this.findAll.bind(this));
            this.setRoutes(true);
        }

        findAll(req, res) {
            let filter= {}
            let range= [];
            let limit = req.query.limit||10;
            let sort = req.query.sort;
            let page = 1;
            let user= req.user;
            if (req.query.filter) {
                try{
                    filter = JSON.parse(req.query.filter);
                }
                catch(e){
                    console.error(e);
                }
            }

            if (req.query.range) {
                try {
                    range= JSON.parse(req.query.range);
                    limit = (range[1]-range[0]+1)
                    page = ((Number(range[0])/limit)+1);
                }
                catch(e) {
                    console.log(e);
                }
            }

            const options = {
                page,
                limit,
                sort: {
                    createdOn:-1
                }
            };
            if(sort){
                const sortParamsArray = JSON.parse(sort);
                if (sortParamsArray[0] !== 'id'){
                    let sortObject = {};
                    sortObject[sortParamsArray[0]] = (sortParamsArray[1] === "ASC" ? 1 : -1);
                    if (sortObject.id){
                        sortObject= undefined;
                    }
                    options.sort = sortObject;
                }
            }

            let SparePart= app.locals.models.SparePart;
            let Consumable= app.locals.models.Consumable;

            let docs= [];
            const loadSpareParts= (next)=>{
                SparePart.find({isDeleted:{$ne:true}}, (err, records)=>{
                    if(err){
                        return next(err);
                    }
                    docs= records;
                    return next();
                });
            };

            const loadConsumables= (next)=>{
                Consumable.find({isDeleted:{$ne:true}}, (err, records)=>{
                    if(err){
                        return next(err);
                    }
                    docs= docs.concat(records);
                    return next();
                });
            };

            Async.series([loadSpareParts, loadConsumables], (err)=>{
                if(err){
                    console.log(err);
                    res.error(K.ERROR.SERVER_INTERNAL);
                    return;
                }
                let start = 1;
                let end = docs.length;
                let total = docs.length;
                res.header('X-Total-Count', total);
                res.header('Content-Range', `records ${start}-${end}/${total}`);
                res.success(docs);
                return;
            });
        }
    }

    return Material;
};
