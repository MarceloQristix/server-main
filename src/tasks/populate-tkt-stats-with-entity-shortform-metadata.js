
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Generate Technician Performance stats', new Date());

    let by = app.locals.admin;
    const TktStats= app.locals.models.TktStats;
    const Ticket= app.locals.models.Ticket;

    TktStats.distinct('_id', (err, ids)=>{
       if(err){
           return doneCb(err);
       }
       const populateEntityShortForm= (id, next)=>{
           TktStats.findById(id, (err, record)=>{
               if(err){
                   return next(err);
               }

               const populateEntityShortFormPerStat=(statId, next2)=>{
                   let ids= record.metaData[statId]?.ids;
                   if (!ids.length){
                       return next2();
                   }
                   Ticket.find({_id:{$in:ids}}, {_id:1, code:1}, (err, entities)=>{
                       record.metaData[statId].entities= [];
                       entities.forEach((entity)=>{
                           record.metaData[statId].entities.push({_id: entity._id, code: entity.code});
                       });
                       return next2();
                   });
               };

               Async.eachSeries(Object.keys(record.metaData), populateEntityShortFormPerStat, (err)=>{
                    if(err){
                        return next(err);
                    }
                    record.markModified('metaData');
                    record.save(next);
               });
           });
       };

       Async.eachSeries(ids, populateEntityShortForm, doneCb);
    });
}
