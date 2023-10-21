const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');

const COLLECTION_NAME = 'form';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const FORM_TYPES = Lodash.map(Settings.form.types, 'id');

    const schemaObj = new Schema({
        name: {
            type: String,
            trim: true,
            required: true
        },
        code: {
            type: String,
            unique: true
        },
        seqId: {
            type: Number,
            unique: true
        },
        version: {  //every update will create a version
            type: Number,
            default: 1,
        },
        fType: {
            type: String,
            enum: FORM_TYPES
        },
        def: {},
        status: {
            type: String,
            enum:[ 'active', 'inactive', 'draft']
        },
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let searchRegExp= new RegExp('.*' + searchStr + '.*', 'i');
            let conditions = {'name': {$regex: searchRegExp}}
            delete query.q;
            query = {...conditions};    //While searching other filters are purposefully ignored
        }
        return query;
    };

    schemaObj.pre('find', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('count', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('countDocuments', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('save', function (next) {
        this.version++;
        if (!this.isNew) {
            return next();
        }
        Counter.getNextSequence(COLLECTION_NAME, (err, {code, seqId}) => {
            if (err) {
                console.log(err);
                return next('error while getNextSequence!');
            }
            this.code = code;
            this.seqId = seqId;
            next();
        });
    });

    schemaObj.post('save', function (doc, next) {
        //FIXME: Sync in all the collections where there is replication.
    });

    const Form = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.Form = Form;

    schemaObj.index({'name': 1});
    schemaObj.index({'code': 1}, {unique: true});
    schemaObj.index({'createdOn': 1});

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix: 'FORM', padding: 6}, (err) => {
        doneCb(err);
    });

    return;
};
