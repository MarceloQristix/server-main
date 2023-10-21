
const Async = require('async');
const fs= require('fs');
const {mkdirpSync} = require('fs-extra');

module.exports = function (app, doneCb){
    console.log('Uploading closed ticket media to s3', new Date());
    const Ticket= app.locals.models.Ticket;

    let by = app.locals.admin;
    const orgSeqId = app.locals.id;

    Ticket.distinct('_id', {media:{$exists:true}, status:{$in:['05_closed']}}, (err, ids)=>{
        if(err){
            return doneCb(err);
        }

        const uploadMedia2S3= (ticketId, next)=>{
            Ticket.findById(ticketId, (err, ticket)=>{
                if(err){
                    return next(err);
                }
                let mediaIds= Object.keys(ticket.media||{});
                let isUpdated= false;
                const upload2S3= (mediaId, next2) =>{
                    //TODO: implement s3 upload
                    let b64string = ticket.media[mediaId].base64;
                    if (!b64string||!b64string.substring){
                        return next2();
                    }
                    let extension= b64string.substring("data:image/".length, b64string.indexOf(";base64"));
                    if (extension!=='png'){
                        return next2();
                    }
                    let baseDir= app.locals.dirs.tickets+'/'+ticket.code;
                    mkdirpSync(baseDir);
                    let fileName= mediaId+'.'+extension;
                    let base64Data = b64string.replace(/^data:image\/png;base64,/, "");
                    let buf = Buffer.from(base64Data, 'base64');
                    fs.writeFile(baseDir+'/'+fileName, buf,  "base64",function(err) {
                        if(err) {
                            return next2(err);
                        }
                        isUpdated= true;
                        ticket.media[mediaId]= {url: `/data/org/${orgSeqId}/tickets/${ticket.code}/${fileName}`,};
                        next2();
                    });
                };
                Async.each(mediaIds, upload2S3, (err)=>{
                    if (err){
                        return next(err);
                    }
                    if (!isUpdated){
                        return next();
                    }
                    ticket.markModified('media');
                    ticket.save(next);
                });
            });
        };
        Async.eachSeries(ids, uploadMedia2S3, (err)=>{
            doneCb(err);
        })
    });
}
