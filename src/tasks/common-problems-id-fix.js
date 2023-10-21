
const Async = require('async');
const Mongoose= require('mongoose');

// Requiring ObjectId from mongoose npm package
const ObjectId = Mongoose.Types.ObjectId;

// Validator function
function isValidObjectId(id){

    if(ObjectId.isValid(id)){
        if((String)(new ObjectId(id)) === id)
            return true;
        return false;
    }
    return false;
}

module.exports = function (app, doneCb){
    console.log('Common problems id fix!', new Date());
    const CommonProblem= app.locals.models.CommonProblem;
    const Ticket= app.locals.models.Ticket;

    console.log('about to get tickets ');
    Ticket.find({sType:'support'}, {_id:1, name:1, desc:1}, (err, records)=>{
        if (err){
            return doneCb(err);
        }
        const updateRecord= (record, next)=>{
            if (!isValidObjectId(record.desc)){
                return next();
            }
            CommonProblem.findOne({name: Mongoose.Types.ObjectId(record.desc)}, (err, cp)=>{
                if (record.name === record.desc){
                    record.name= cp.name;
                }
                record.desc= cp.name;
                record.save(next);
            });
        };
        Async.eachSeries(records, updateRecord, doneCb);
    });
}
