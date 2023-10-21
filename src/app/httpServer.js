const Http = require('http');

let _isTerminating = false;
let _isExiting = false;

let _server;

const init = (app, port, doneCb) => {

    const Logger = app.locals.Logger;

    _server = Http.createServer(app);

    /**
     * Listen on provided port, on all network interfaces.
     */
    _server.listen(port);
    _server.on('error', onError);
    _server.on('listening', onListening);

    /**
     * Event listener for HTTP server "error" event.
     */

    function onError(error) {
        if (error.syscall !== 'listen') {
            Logger.error('Syscall != listen');
            return doneCb(error);
        }

        var bind = typeof port === 'string'
            ? 'Pipe ' + port
            : 'Port ' + port;

        // handle specific listen errors with friendly messages
        switch (error.code) {
            case 'EACCES':
                Logger.error(bind + ' requires elevated privileges');
                doneCb(error);
                break;
            case 'EADDRINUSE':
                Logger.error(bind + ' is already in use');
                doneCb(error);
                break;
            default:
                doneCb(error);
        }
    }

    /**
     * Event listener for HTTP server "listening" event.
     */

    function onListening() {
        var addr = _server.address();
        var bind = typeof addr === 'string'
            ? 'pipe ' + addr
            : 'port ' + addr.port;
        Logger.info('Listening on ' + bind);
        app.locals._server = _server;
        return doneCb();
    }

};

const shutdown = (app, doneCb) => {
    let timeout;
    const Logger = app.locals.Logger;
    if (_isTerminating) {
        if (!_isExiting) {
            Logger.warn('About to HARD EXIT in 2s');
            timeout = setTimeout(doneCb, 2 * 1000);
            _isExiting = true;
        }
        return;
    }
    _isTerminating = true;
    if (_server) {
        _server.close(() => {
            clearTimeout(timeout);
            timeout = undefined;
            doneCb();
        });
    }
};

module.exports = {
    init,
    shutdown
};
