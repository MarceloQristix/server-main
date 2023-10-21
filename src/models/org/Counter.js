const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const ToHex = require('to-hex');

const COLLECTION_NAME = 'seq_counter';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;

    const schemaObj = new Schema({
        name        : { //Collection name
            type    : String,
            required: true,
            unique  : true
        },
        seqId       : {
            type    : Number,
            required: true
        },
        prefix      : {
            type    : String,
            default : ''
        },
        padding   : {
            type    : Number
        },
        isHex       : {
            type    : Boolean,
            default : false
        }
    });

    schemaObj.statics.getLastSequence = function (name, callback){
        this.findOne({name}, (err, record)=>{
            if (err){
                return callback(err);
            }
            if (!record){
                return callback('Counter not found!');
            }
            return callback(undefined, record.seqId);
        });
    };

    schemaObj.statics.getNextSequence=  function(name, callback){
        this.findOneAndUpdate({name:name}, {$inc:{seqId:1}}, {returnDocument: 'after'}, (err, record)=>{
            if (err) {
                console.log('error while getting next seq', err);
                return callback(err);
            }
            if (!record){
                return callback('Counter not found!');
            }

            let code = '';
            let seqId= record.seqId;

            if (record.isHex){
                 code= ToHex(seqId, { size: record.padding }).toUpperCase();
            }
            else {
                code= ''+seqId;
                if (record.padding){
                    code= code.padStart(record.padding, '0');
                }
            }

            let paddedSeqId= code;

            if (record.prefix){
                code = record.prefix + code;
            }
            return callback(undefined, {code, seqId, paddedSeqId});
        });
    };

    schemaObj.statics.initCounter= function(by, name, initialValue=0, {prefix, padding, isHex}, callback, ){
        this.findOne({name: name}, (err, record) =>{
            if (err) {
                return callback(err);
            }
            if (record){
                record.prefix = prefix;
                record.padding = padding;
                if (record.seqId < initialValue) {
                    record.seqId= record.seqId+initialValue;
                }
            }
            else {
                let data = {
                    name,
                    seqId: initialValue || 0,
                    prefix,
                    padding,
                    isHex,
                    createdBy: by
                };
                record= new this(data);
            }
            record.save((err) =>{
                return callback(err, err? undefined: record);
            });
            return 0;
        });
    };

    app.locals.models.Counter = Db.model(COLLECTION_NAME, schemaObj);

    return doneCb();
};
