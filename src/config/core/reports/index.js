const { assign } = require('lodash');
const Moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");
momentDurationFormatSetup(Moment);

const formatDateTime= function (val) {
    //dd/mm/yy hh:mm (24 hrs)
    return Moment(val).format('DD/MM/YY HH:MM');
}

const ReportsDef = {};

['asset', 'ticket', 'contract', 'sparePart', 'technician', 'ttkCustomReports'].forEach((group)=>{
    let reports= require('./'+group);
    for (let reportId in reports){
        ReportsDef[reportId]= reports[reportId];
    }
});


module.exports = ReportsDef;