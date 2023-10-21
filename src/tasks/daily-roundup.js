const Async = require('async');
const Moment = require('moment');
const path = require('path');
const Lodash= require('lodash');

const qristixEmail = 'business-roundup@qristix.com';

module.exports = function(app, doneCb) {
    const Ticket = app.locals.models.Ticket;
    const Customer = app.locals.models.Customer;
    const EventLog= app.locals.models.EventLog;
    const OrgUser= app.locals.models.OrgUser;

    const DateTime = app.locals.services.DateTime;

    let settings = app.locals.Settings;

    if (!settings.roundupEmail || (settings.roundupEmail.length === 0)){
        console.log('skipped .. ' , settings.name);
        return doneCb();
    }
    let to= settings.roundupEmail || settings.owner.uniqueId;
    let customerName= settings.owner?.name||'User';
    const mainApp = app.locals.mainApp;
    const emailService = mainApp.locals.services.Email;

    let dataToSend = {
            customerName: customerName,
            today: new Date().toDateString()
        },
        todayCond= {
            '$gte': DateTime.getMoment().startOf('day').toDate(),
            '$lte': DateTime.getMoment().endOf('day').toDate()
        },
        roundupEmail = path.join('./tpls/html','daily-roundup.ejs');

    const getTicketsCreated = function(next) {
        Ticket.countDocuments({'createdOn': todayCond}, (err, count) =>{
            if(err) {
                next(err);
            }
            dataToSend['createdToday'] = count;
            next();
        });
    };

    const getTicketsClosed = function(next) {
        Ticket.countDocuments({'completedOn': todayCond}, (err, count)=> {
            if(err) {
                next(err);
            }
            dataToSend['closedToday'] = count || 0;
            next();
        });
    };

    const getTicketsUnresolved = function(next) {
        Ticket.countDocuments({'status': {'$eq': '03_on_hold'}}, (err,count) =>{
            if(err) {
                next(err);
            }
            dataToSend['unresolvedTotal'] = count;
            next();
        });
    };

    const getTicketsHeldForSpares = function(next) {
        Ticket.countDocuments({'status': {'$eq': '03_on_hold'}, holdReason:{'$eq':'01_spares_not_available'}}, (err,count) => {
            if(err) {
                next(err);
            }
            dataToSend['heldForSpares'] = count;
            next();
        })
    };

    const getCustomersAddedToday = function(next) {
        Customer.countDocuments({'createdOn': todayCond}, (err,count) =>{
            if(err) {
                next(err);
            }
            dataToSend['customersAddedToday'] = count;
            next();
        })
    };

    const getRevenueToday = function(next) {
        Ticket.find({'completedOn': todayCond}, (err, records) =>{
            if(err) {
                next(err);
            }
            let sum = 0;
            records.map((record) =>{
                if (!record.bill){
                    return;
                }
                sum = sum + record.bill.total;
            });
            dataToSend['revenueToday'] = sum;
            next();
        })
    };

    let technicianIds= [];

    const loadTechnicians= (next)=>{
        let cond= {
            // "access": {"resource": "ticket", "action": "work"},
            role: {$nin:['business_head', 'manager', 'admin']},
            // "globalUser.status": "active"
        };
        OrgUser.find(cond, (err, records)=>{
            if(err){
                return next();
            }
            technicianIds= records.map(record=>record._id);
            return next();
        });
    };

    const getTechnicianWorked = function(next) {
        EventLog.distinct('createdBy', {'createdOn': todayCond}, (err, technicianIds) =>{
            if(err) {
                next(err);
            }
            dataToSend['techniciansWorked'] = technicianIds.length;
            next();
        })
    }

    Async.series([
        getTicketsCreated,
        getTicketsClosed,
        getTicketsUnresolved,
        getTicketsHeldForSpares,
        getCustomersAddedToday,
        loadTechnicians,    //should be before getTechnicianWorked always
        getTechnicianWorked,
        getRevenueToday
    ], function(err) {
        if(err) {
            console.log('>>>>>>>>>>>>>>Error sending daily roundup emails '+err);
            return;
        }
        emailService.sendEJS("Daily Round Up", roundupEmail, dataToSend, to, qristixEmail,function(err) {
            if(err){
                console.log(">>>>>>>>>Error sending daily round-up Email to "+to+" "+err);
                return doneCb();
            }
            console.log(">>>>>>>>Daily round-up email sent to "+to);
            doneCb();
        })
    })
}