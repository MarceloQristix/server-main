const Async = require('async');

module.exports = function (app, doneCb){
    console.log("About to load country state city!!");
    const MainApp= app.locals.mainApp;
    const State= MainApp.locals.models.State;
    const City= MainApp.locals.models.City;

    const stats= {};

    const loadStates= (next) =>{
        const states= require('../../masters/states.json');
        const upsertState= (data, next2) =>{
            data.source_id= data.id
            State.findOneAndUpdate(
                { source_id:  data.source_id},
                { $set: data},
                { upsert: true, new: true} ,
                (err)=>{
                    if(err){
                        return next2(err);
                    }
                    return next2();
                }
            );
        };
        Async.eachSeries(states, upsertState, (err)=>{
            if(err){
                return next(err);
            }
            stats.numStates= states.length;
            State.countDocuments({}, (err, count)=>{
                if(err){
                    return next(err);
                }
                stats.statesCount= count;
                return next();
            });
        });
    };

    const loadCities= (next) =>{
        const cities= require('../../masters/cities.json');
        const upsertCity= (data, next2) =>{
            data.source_id= data.id
            City.findOneAndUpdate(
                { source_id:  data.source_id},
                { $set: data},
                { upsert: true, new: true} ,
                (err)=>{
                    if(err){
                        return next2(err);
                    }
                    return next2();
                }
            );
        };
        Async.eachSeries(cities, upsertCity, (err)=>{
            if(err){
                return next(err);
            }
            stats.numCities= cities.length;
            City.countDocuments({}, (err, count)=>{
                if(err){
                    return next(err);
                }
                stats.citiesCount= count;
                return next();
            });
        });
    };

    Async.series([loadCities], (err)=>{
        if(err){
            console.log(err);
        }
        console.log(stats);
        doneCb(err);
    });
}
