const Moment= require('moment');

const DataDef= {
  "name": "Assets",
  "fields": [
    {
      "name": "SN / Asset ID",
      "aliases": [],
      "id": "serialNumber",
    },
    {
      "name": "Equipment ID / Machine ID",
      "aliases": [],
      "id": "secondaryCode"
    },
    {
      "name": "Asset",
      "aliases": [],
      "id": "productModel"
    },
    {
      "name": "Product",
      "id": "product",
    },
    {
      "name": "Model",
      "id": "model",
    },
    {
      "name": "Customer Name",
      "aliases": [],
      "id": "customerName"
    },
    {
      "name": "Customer Code",
      "aliases": [],
      "id": "customerCode"
    },
    {
      "name": "Product Location",
      "aliases": [],
      "id": "address.addrLine1"
    },
    {
      "name": "Product LocatedAt",
      "aliases": [],
      "id": "locatedAt"
    },
    {
      "name": "Address 2",
      "aliases": [],
      "id": "address.addrLine2"
    },
    {
      "name": "State",
      "aliases": [],
      "id": "address.state"
    },
    {
      "name": "City",
      "aliases": [],
      "id": "address.city"
    },
    {
      "name": "Pincode",
      "aliases": [],
      "id": "address.pincode"
    },
    {
      "name": "Installation",
      "aliases": [],
      "id": "installedOn",
      "fun": (val, record)=>{
        let formattedVal= '';
        try {
          formattedVal= Moment(val,'D/M/YYYY').isValid()? Moment(val,'D/M/YYYY').toDate(): '';
          if (!formattedVal){
            formattedVal= Moment(val,'MM/DD/YY').isValid()? Moment(val,'MM/DD/YY').toDate(): '';
          }
        }
        catch(e) {
          console.log('invalid date', e);
        }
        return formattedVal;
      }
    },
    {
      "name": "Branch",
      "aliases": [],
      "id": "branch"
    },
    {
      "name": "Technician",
      "aliases": [],
      "id": "technician"
    },
    {
      "name": "Contract",
      "aliases": [],
      "id": "isUnderContract"
    },
    {
      "name": "Expiry Type",
      "aliases": [],
      "id": "expiryType"
    },
    {
      "name": "Con No",
      "aliases": [],
      "id": "contractNumber"
    },
    {
      "name": "Start Counter",
      "aliases": [],
      "id": "initialReadingTotalMeter"
    },
    {
      "name": "Expiry Counter",
      "aliases": [],
      "id": "maxReadingTotalMeter"
    },
  ]
}

module.exports= DataDef;
