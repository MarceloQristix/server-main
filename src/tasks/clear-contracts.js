
const Async = require('async');

module.exports = function (app, doneCb){
    console.log('Contracts Clear!', new Date());

    const Asset= app.locals.models.Asset;
    const Ticket=app.locals.models.Ticket;
    const Contract= app.locals.models.Contract;
    const Counter = app.locals.models.Counter;

    let contracts= [];
    const loadContracts= (next)=>{
        let conditions= {};
        Contract.find(conditions, (err, records)=>{
            if (err){
                return next(err);
            }
            contracts= records;
            return next();
        })
    };

    const clearRelatedData = (next) =>{
        const doClearRelatedData = (contract, next2)=>{
            const clearPMTickets = (next3)=>{
                Ticket.deleteMany({'asset.contract._id': contract._id}, next3);
            };

            const clearContractReferenceInAssets = (next3)=>{
                Asset.update({'contract._id':contract._id}, {$unset:{contract:undefined}}, {multi:true}, next3);
            };
            Async.series([clearPMTickets, clearContractReferenceInAssets], next2);
        }
        Async.eachSeries(contracts, doClearRelatedData, next);
    }

    const resetPMTicketCounter= (next) =>{
        Counter.findOne({prefix:'PMTKT'}, (err, counter)=>{
            if (err){
                return next();
            }
            if (!counter) {
                return next();
            }
            counter.seqId=0;
            counter.save(next);
        });
    }

    const removeContracts = (next) =>{
        Contract.deleteMany({}, next);
    };

    Async.series([loadContracts, clearRelatedData, resetPMTicketCounter, removeContracts], doneCb);
}
