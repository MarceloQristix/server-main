const extractNumbers= require('extract-numbers');

const {toDate}= require('../../../lib/DateUtils');

const toNumber= function (val){
    let outNumber= val;
    if (typeof val !== 'number'){
        try{
            outNumber= Number(extractNumbers(val)[0])
        }
        catch(e){
            outNumber= val;
        }
    }
    return outNumber;
}

const DataDef = {
    "name": "Bookings",
    "fields": [
        {
            "name": "S.NO.",
            "aliases": ["S.No"],
            "id": "rowNumber"
        },
        {
            "name": "Unique Order",
            "id": "serialNumber"
        },
        {
            "name": "Dealer Code",
            "id": "orgUnit.code"
        },
        {
            "name": "Dealer Display Name",
            "id": "orgUnit.name"
        },
        {
            "name": "Order No",
            "id": "extraCode1"
        },
        {
            "name": "Booking Amend Date",
            "id": "custom.bookingAmendedOn",
            "fun": toDate
        },
        {
            "name": "Order Date",
            "id": "installedOn",
            "fun": toDate
        },
        {
            "name": "Booking Status",
            "id": "status",
            "fun": (val)=>{
                return val?.toLowerCase();
            }
        },
        {
            "name": "Model",
            "id": "sku.model"
        },
        {
            "name": "Suffix Name",
            "id":"sku.suffixName"
        },
        {
            "name": "SUFFIX",
            "id":"sku.suffix"
        },
        {
            "name": "Suffix Code",
            "id":"sku.suffixCode"
        },
        {
            "name": "Exterior Color Description",
            "id":"sku.color"
        },
        {
            "name": "Exterior Color Code",
            "id":"sku.colorCode"
        },
        {
            "name": "Customer Title",
            "id":"customer.title"
        },
        {
            "name": "Customer Name",
            "id":"customer.name"
        },
        {
            "name": "Customer Email ID ( As per Booking form)",
            "id":"customer.contact.email"
        },
        {
            "name": "Customer Mobile Number ( As per Booking form)",
            "id":"customer.contact.phoneNumber"
        },
        {
            "name": "Team Leader",
            "id":"custom.teamLeader"
        },
        {
            "name": "Sales Officer",
            "id":"custom.salesOfficer"
        },
        {
            "name": "Received Amount",
            "id":"custom.receivedAmount"
        },
        {
            "name": "Tentative Delivery quoted",
            "id":"custom.tentativeDeliveryQuoted",
            // "fun": toDate  -- intentional to not convert to date, we do formatting run time, while displaying
        },
        {
            "name": "Initial Booking Sequence No",
            "id":"custom.initialBookingSequenceNumber",
            "fun": toNumber
        },
        {
            "name": "Current Booking Sequence No",
            "id":"custom.currentBookingSequenceNumber",
            "fun": toNumber,
        },
        {
            "name": "Initial Waiting Period Quoted In Weeks - Minimum",
            "aliases": ["Initial Waiting Period Quoted In Minimum"],
            "id":"custom.minWaitingPeriodInWeeksQuoted",
            "fun": toNumber
        },
        {
            "name": "Initial Waiting Period Quoted  In Weeks- Maximum",
            "aliases": ["Initial Waiting Period Quoted  In - Maximum"],
            "id":"custom.maxWaitingPeriodInWeeksQuoted",
            "fun": toNumber
        },
        {
            "name": "Current Waiting Period Quoted In Weeks - Minimum",
            "aliases": ["Current Waiting Period Quoted In - Minimum"],
            "id":"custom.currentMinWaitingPeriodInWeeks"
        },
        {
            "name": "Current Waiting Period Quoted In Weeks - Maximum",
            "aliases": ["Current Waiting Period Quoted In  - Maximum"],
            "id":"custom.currentMaxWaitingPeriodInWeeks"
        }
    ]
}

module.exports = DataDef;
