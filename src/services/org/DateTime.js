const Moment = require('moment-timezone');
const CT = require('countries-and-timezones');

module.exports = function (app) {

    class DateTime {
        constructor() {
            const country= CT.getCountry(app.locals.Settings.countryCode||'IN');

            this.timeZone = country.timezones[0]; //FIXME: handle multiple timezones
            /*
            {
              id: 'DE',
              name: 'Germany',
              timezones: [ 'Europe/Berlin', 'Europe/Zurich' ]
            }
            */
            app.locals.services.DateTime= this;
        }

        getMoment(date) {
            return Moment.utc(date).tz(this.timeZone);
        }
    }

    return DateTime;
}
