const Moment= require('moment');
const DataDef= {
  "name": "Contracts",
  "fields": [
    {
      "name": "Contract No",
      "aliases": [],
      "id": "code"
    },
    {
      "name": "Contract Ref",
      "aliases": [],
      "id": "referenceNumber"
    },
    {
      "name": "Status",
      "aliases": [],
      "id": "status",
      "fun": (val)=>{
        return "03_active";
      }
    },
    {
      "name": "Plan",
      "aliases": [],
      "id": "cType"
    },
    {
      "name": "Expiry Type",
      "aliases": [],
      "id": "expiryType",
      "fun": (val)=>{
        return val === "Time or Copy Based"? "03_early_target": "02_time_based";
      }
    },
    {
      "name": "Start Date",
      "aliases": [],
      "id": "startDate",
      "fun": (val, record)=>{
        let dt= val?Moment(val,'D/M/YYYY'): false;
        return val&&dt.isValid()? dt: false;
      }
    },
    {
      "name": "Exp Date",
      "aliases": [],
      "id": "endDate",
      "fun": (val, record)=>{
        let dt= val?Moment(val,'D/M/YYYY'): false;
        return val&&dt.isValid()? dt: false;
      }
    },
    {
      "name": "Customer",
      "aliases": [],
      "id": "customerName"
    }
  ]
}

module.exports= DataDef;
