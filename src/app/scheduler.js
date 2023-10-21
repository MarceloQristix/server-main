const NodeSchedule = require('node-schedule');

let _isTerminating = false;
let _isExiting = false;

const init = (app, doneCb) => {

    const Logger = app.locals.Logger;


    doneCb();

};

const shutdown = (app, doneCb) => {
    //TODO: need to implement graceful shutdown
    doneCb();
};

module.exports = {
    init,
    shutdown
};
