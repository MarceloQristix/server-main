const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Async = require('async');
const COLLECTION_NAME = 'commonProblem';

module.exports = function(app,doneCb) {

    const Db = app.locals.Db;    
    const schema = new Schema({
        name        : {
            type    : String,
            unique  : true,
            trim    : true
        },
        skuIds      : [ObjectId],
        version: {type: Number, default:1},
        // skus: [{type: ObjectId, ref:'sku'}]
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let conditions = { 'name': {$regex: new RegExp('.*' + searchStr + '.*', 'i')} };
            delete query.q;
            query =  {...conditions };
        }
        if (query.excludeIds) {
            query._id = {
                $nin: Lodash.map(query.excludeIds, (id) => {
                    return Mongoose.Types.ObjectId(id)
                })
            };
            delete query.excludeIds;
        }
        if (query.id) {
            query.name = {
                $in: query.id
            };
            delete query.id;
        }
        return query;
    };

    schema.statics.addProblems = function(by,data,cb){
        let defects= Array.isArray(data)?data: [data];

        const createOrUpdateDefect= (defect, next)=>{
            this.findOne({name:defect.name}, (err, record)=>{
                if(err){
                    return next(err);
                }
                if (record){    //nothing to do.
                    return next();
                }
                let doc= new this({
                    name: defect.name,
                    createdBy: by
                });
                doc.save(next);
            });
        };

        Async.eachSeries(defects, createOrUpdateDefect, (err)=>{
            cb(err, defects.length);    //sending length is work around
        });
    };

    schema.statics.updateProblems = function(by, id, data,cb){
        let defects= Array.isArray(data)?data: [{...data, id}];

        const updateRecord= (defect, next)=>{
            this.findById(defect.id, (err, record)=>{
                if(err){
                    return next(err);
                }
                if (!record){
                    return next('record not found!');
                }
                record.name= defect.name;
                record.lastModifiedBy= by;
                record.save(next);
            });
        };

        Async.eachSeries(defects, updateRecord, (err)=>{
            cb(err, defects.length);    //sending length is work around
        });
    }

    schema.pre('findOne', function (next) {
        this.populate("skus");
        next();
    });

    schema.pre('find', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schema.pre('count', function () {
        this.setQuery(formatQuery(this.getQuery()));    schema.index({'skuIds': 1});
    });

    schema.pre('countDocuments', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    // schema.set('toObject', {virtuals: true});
    // schema.set('toJSON', {virtuals: true});

    schema.index({'name': 1}, {unique: true});
    schema.index({'skuIds': 1});

    const CommonDefects= Db.model(COLLECTION_NAME,schema);
    app.locals.models.CommonProblem = CommonDefects;
    CommonDefects.syncIndexes();

    return doneCb();
};
