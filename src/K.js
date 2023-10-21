/**
 * @desc This file contains all the global constants
 */
const K = {
    RUN_MODE: {
        BUSINESS_API    : 'business_api',
        MANAGE_API      : 'manage_api',
        WORKER          : 'worker',
        EXEC_ONCE       : 'exec_once'
    },
    API_ERROR: {
        INVALID_VALUE: 'invalid_value',
    }
};

//Do reverse mapping for easy access
K.R = {};

K.ERROR = {
    DOC_NOT_FOUND: {
        code: 0x001,
        message: 'Document Not Found'
    },
    MONGO_INTERNAL: {
        code: 0x002,
        message: 'Mongo Internal Error'
    },
    MONGO_FIND: {
        code: 0x003,
        message: 'Mongo Find Error'
    },
    MONGO_SAVE: {
        code: 0x004,
        message: 'Mongo Save Error'
    },
    SERVER_INTERNAL: {
        code: 0x500,
        name: 'Server Internal Error',
        message: 'Server Internal Error'
    }

};

K.R.ERROR = {};
for (let key in K.ERROR) {
    K.R.ERROR[K.ERROR[key].code] = key;
}

module.exports = K;
