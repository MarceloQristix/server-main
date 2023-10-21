const {getMessaging} = require('firebase-admin/messaging')
const admin = require("firebase-admin");

class PushNotification {
    constructor(serviceAccount) {
        this.isInitialized= false;
        if (serviceAccount){
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: 'qristix-production'
            });
            this.isInitialized= true;
        }
    }

    send (registrationToken, data, callback) {
        if (!this.isInitialized){
            setTimeout(()=>callback('error, fcm not available'), 0);
            return 0;
        }

        const message = {
            ...data,
            token: registrationToken
        };

        getMessaging().send(message)
            .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message:', response);
                callback();
            })
            .catch((error) => {
                console.log('Error sending message:', error);
                callback(error);
            });
    }
};

module.exports = PushNotification;
