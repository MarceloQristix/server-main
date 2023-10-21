const Moment= require('moment');
const DataDef= {
  "name": "Customers",
  "uniqueIdentifierKey": "name",
  "fields": [
    {
      "name": "Customer Name",
      "aliases": [],
      "id": "name",
    },
    {
      "name": "Customer Code",
      "aliases": [],
      "id": "secondaryCode"
    },
    {
      "name": "Customer Phone 1",
      "aliases": [],
      "id": "contact.phoneNumber"
    },
    {
      "name": "Customer Phone 2",
      "aliases": [],
      "id": "contact.altPhoneNumber"
    },
    {
      "name": "Customer Email",
      "aliases": [],
      "id": "contact.email"
    },
    {
      "name": "Customer Address",
      "aliases": [],
      "id": "address.addrLine1"
    }
  ]
}

module.exports= DataDef;
