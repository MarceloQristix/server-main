const Async = require("async");
const K = require("../../K");
module.exports = function (app) {
    const AbstractCrud = require('../AbstractCrud')(app);

    class CommonProblem extends AbstractCrud {
        constructor(groupPrefix) {
            const basePath= [groupPrefix, 'common-problem'].join('/');
            super(basePath, app.locals.models.CommonProblem,true);
            this.router.post('/', this.create.bind(this));
            this.router.put('/:id', this.updateProblems.bind(this));
            this.setRoutes();
        }
        
        create(req,res){
            this.model.addProblems(req.user,req.body,(err,id) => {
                if (err) return res.error({ error: err });
                return res.success({ id });
            });
        }

        updateProblems(req,res){
            this.model.updateProblems(req.user, req.params.id, req.body,(err) => {
                if(err) return res.error({ error:err });
                return res.success({ id: req.params.id });
            });
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

            let docs= [];
            const loadDefects= (next)=>{
                this.model.find({isDeleted:{$ne:true}}, (err, records)=>{
                    if(err){
                        return next(err);
                    }
                    records.forEach((record)=>{
                        docs.push({
                            name:record.name,
                            id:record.name,
                            skus: record.skus,
                            skuIds: record.skuIds,
                            _id: record._id
                        });
                    });
                    return next();
                });
            };

            Async.series([loadDefects], (err)=>{
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

    return CommonProblem;
};
