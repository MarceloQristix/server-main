
const DataDef= {
  "name": "Users",
  "fields": [
    {
      "name": "Sl.No",
      "aliases": [],
      "id": "code",
    },
    {
      "name": "First Name",
      "aliases": [],
      "id": "globalUser.firstName"
    },
    {
      "name": "Second Name",
      "aliases": [],
      "id": "globalUser.lastName"
    },
    {
      "name": "Designation",
      "aliases": [],
      "id": "role",
      "fun": function (val){
        let lowerCasedRole= val.toLowerCase();
        return lowerCasedRole === 'business head'? 'business_head': lowerCasedRole;
      }
    },
    {
      "name": "Contact Number",
      "aliases": [],
      "id": "globalUser.contact.phoneNumber"
    },
    {
      "name": "EMail Id",
      "aliases": [],
      "id": "globalUser.uniqueId"
    },
    {
      "name": "Belongs to",
      "aliases": [],
      // "id": "belongsTo"
    },
    {
      "name": "Reports to whom",
      "aliases": [],
      "id": "reportsTo"
    },
    {
      "name": "Password",
      "aliases": [],
      "id": "globalUser.password"
    }
  ]
}

module.exports= DataDef;
