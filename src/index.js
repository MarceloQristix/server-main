/**
 * @desc -- Entry point for the application
 */

const Path = require('path');

const K = require('./K');
const App = require('./app');

const mode = process.argv[2];
const rootDir = Path.join(__dirname, '../');

const ALL_MODES = Object.values(K.RUN_MODE);

if (!mode) {
    console.error('Provide mode, one of : ', ALL_MODES.join(', '));
    return process.exit();
}

if (ALL_MODES.indexOf(mode.toLowerCase()) === -1) {
    console.error('Invalid mode', mode, ' Provide mode, one of : ', ALL_MODES.join(', '));
    return process.exit();
}

App.init(rootDir, mode, (err) => {
    if (err) {
        console.error('Error######^^^&&&', err);
        return process.exit();
    }
    console.log(`Successfully started server in ${mode}!!!`);

    if (mode === 'exec_once'){
        console.log('About to shutdown!');
        App.shutdown(() => {
            console.log('Shutdown complete!');
            return process.exit();
        });
    }
});

process.on('SIGINT', function () {
    console.log('Received SIGINT. Initiating shutdown..');
    App.shutdown(() => {
        console.log('Shutdown complete!');
        return process.exit();
    });
});

process.on('SIGTERM', function () {
    console.log('Received SIGTERM. Initiating shutdown..');
    App.shutdown(() => {
        console.log('Shutdown complete!');
        return process.exit();
    });
});
