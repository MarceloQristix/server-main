/**
 * @desc Contains Meter Type definition
 */
const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ObjectId = Schema.ObjectId;

const COLLECTION_NAME = 'meter_type';

module.exports = function (app, doneCb) {
    const Db = app.locals.Db;

    const schemaObject= new Schema({
        name        : {
            type    : String,
            required: true,
            unique  : true
        },
        code        : {
            type    : String,
            unique  : true
        },
        desc        : {
            type    : String
        },
        seqId       :{
            type    : Number,
            unique  : true,
        }
    });

    schemaObject.pre('save', function (next) {
        if (!this.isNew){
            return next();
        }
        Counter.getNextSequence(COLLECTION_NAME, (err, {code, seqId})=>{
            if (err){
                console.log(err);
                return next('error while getNextSequence!');
            }
            this.code= code;
            this.seqId= seqId;
            next();
        });
    });

    const MeterType = Db.model(COLLECTION_NAME, schemaObject);
    app.locals.models.MeterType = MeterType;

    const Counter = app.locals.models.Counter;
    const sysUser = app.locals.sysUser;

    Counter.initCounter(sysUser._id, COLLECTION_NAME, 0, {prefix:'MT', padding:4}, (err)=> {
        doneCb(err);
    });

};
