const Moment= require('moment');

const DataDef= {
  "name": "PM Schedules",
  "fields": [
    {
      "name": "Scheduled On",
      "aliases": [],
      "id": "dueDate",
      "fun": (val, record)=>{
        return Moment(val,'MMM DD, YYYY').toDate();
      }
    },
    {
      "name": "Type",
      "desc": "Ignore this field",
      "aliases": [],
      "id": ""
    },
    {
      "name": "Description",
      "aliases": [],
      "id": "name"
    },
    {
      "name": "Customer",
      "aliases": [],
      "id": "customerName",
      "fun": (val, record) =>{
        return val;
      }
    },
    {
      "name": "Product",
      "aliases": [],
      "id": "serialNumber",
      "fun": (val, record)=>{
        let parts= val.split(' ');
        return parts[parts.length-1];
      }
    },
    {
      "name": "Contract",
      "aliases": [],
      "id": "contractNumber",
      "fun": (val, record)=>{
        let parts= val.split(' ');
        return parts[parts.length-1];
      }
    },
    {
      "name": "Status",
      "aliases": [],
      "id": "status"
    },
    {
      "name": "Branch",
      "aliases": [],
      "id": ""
    },
    {
      "name": "Technician",
      "aliases": [],
      "id": ""
    }
  ]

}

module.exports= DataDef;
