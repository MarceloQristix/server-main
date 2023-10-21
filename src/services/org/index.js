
const init = function (app, doneCb) {
    const SERVICES= [
        'DateTime'
    ];
    if (!app.locals.services){
        app.locals.services= {};
    }
    for (let index=0; index<SERVICES.length; index++){
        const ServiceClass = require(['.', SERVICES[index]].join('/'))(app);
        const service= new ServiceClass();
    }
    doneCb();
};

const shutDown= function (app, doneCb) {
    doneCb();
}

module.exports={
    init,
    shutDown
};
