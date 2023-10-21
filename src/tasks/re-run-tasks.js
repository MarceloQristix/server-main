const Async= require('async');
const Moment= require('moment');

module.exports = function (app, doneCb){
    console.log("About to reload Finished Tasks Data !!");
    const OrgUser= app.locals.models.OrgUser;
    const Task = app.locals.models.Task;
    const by= app.locals.admin;

    let startDateTS= new Date();
    let endDateTS= new Date();

    let taskIds= [];
    let taskSelectionCond= {seqId:833};//{status:'finished'};

    const loadFinishedTasks= (next)=>{
        Task.find(taskSelectionCond, {_id:1}, {sort:{createdOn:1}}, (err, records)=>{
            records.forEach((record)=>{
                taskIds.push(record._id);
            });
            return next(err);
        });
    };

    const reloadTaskData= (next)=>{
        const reloadOneTaskData= (taskId, next2)=>{
            let task;
            const loadTask= (next3)=>{
                Task.findById(taskId,(err, record)=>{
                    if (err){
                        return next3(err);
                    }
                    task= record;
                    console.log('reLoading task data of', task.code);
                    return next3();
                });
            };

            const dryRunAgain= (next3)=>{
                task.dryRun(by, next3, true);
            };

            const commitAgain= (next3)=>{
                task.commit(by, next3, true);
            };

            let steps= [
                loadTask,
                dryRunAgain,
                commitAgain
            ];
            Async.series(steps, next2);
        };

        Async.eachSeries(taskIds, reloadOneTaskData, next);
    }

    Async.series([loadFinishedTasks, reloadTaskData], (err)=>{
        if (err){
            console.log('err', err);
        }
        endDateTS= new Date();
        console.log('time taken to complete in minutes:', Moment(endDateTS).diff(startDateTS,'m'));
    });
}
