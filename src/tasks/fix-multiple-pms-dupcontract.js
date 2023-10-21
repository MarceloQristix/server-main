
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Remove pm tickets if they are generated due to another contract!', new Date());
    const Contract= app.locals.models.Contract;
    const Asset= app.locals.models.Asset;
    const Ticket= app.locals.models.Ticket;

    let by = app.locals.admin;
    console.log('about to fix pms ');
    let fixedPMs= [];

    Ticket.find({status:'01_open', sType: 'pm'}, (err, tickets)=>{
        if (err){
            return doneCb(err);
        }

        const removeIfDuplicate= (ticket, next)=>{
            if (!ticket.asset|| !ticket.asset._id){
                return next();
            }
            let asset;
            let lastClosedPM;
            const loadAsset= (next2)=>{
                Asset.findById(ticket.asset._id, (err, record)=>{
                    if(err){
                        return next2(err);
                    }
                    asset= record;
                    return next2();
                });
            };

            const loadLastClosedPMWithSameDueDate= (next2)=>{
                Ticket.findOne({sType: 'pm', 'asset._id': asset._id, dueDate: ticket.dueDate, status:'05_closed'},(err, record)=>{
                    if(err){
                        return next2(err);
                    }
                    lastClosedPM= record;
                    return next2();
                });
            };

            const removeOpenPM= (next2)=>{
                if (!lastClosedPM){
                    return next2();
                }
                console.log(`Removing --- ${ticket.code}, ${ticket.name} as ${lastClosedPM.code}, ${lastClosedPM.name} closed recently`);
                fixedPMs.push({
                    closed: {
                        code: lastClosedPM.code,
                        name: lastClosedPM.name,
                        contract: lastClosedPM.asset?.contract?.code
                    },
                    open: {
                        code: ticket.code,
                        name: ticket.name,
                        contract: ticket.asset?.contract?.code
                    },
                    asset: ticket.asset.code,
                });
                Ticket.remove({_id:ticket._id}, next2);
            };

            const updateClosedPMContractRef= (next2)=>{
                if (!lastClosedPM){
                    return next2();
                }
                lastClosedPM.asset= {...ticket.asset};
                return lastClosedPM.save(next2);
            };

            Async.series([loadAsset, loadLastClosedPMWithSameDueDate, removeOpenPM, updateClosedPMContractRef], next);
        };
        Async.eachSeries(tickets, removeIfDuplicate, (err)=>{
            if(err){
                console.log(err);
                return doneCb(err);
            }
            console.log(fixedPMs, fixedPMs.length + 'pm tickets removed');
            return doneCb();
        });
    });
}
