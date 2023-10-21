
module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class EventLog extends AbstractCrud {

        constructor(groupPrefix) {
            super([groupPrefix, 'eventlog'].join('/'), app.locals.models.EventLog);
        }

    }

    return EventLog;
};
