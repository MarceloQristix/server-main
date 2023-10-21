
const DataDef = {
    "name": "Dealers",
    "fields": [
        {
            "name": "Zone",
            "id": "site.zone",
            "lowercase": true
        },
        {
            "name": "ARD Name",
            "id": "customer.name",
            "required": true
        },
        {
            "name": "ARD Phone No",
            "id": "customer.contact.phoneNumber"
        },
        {
            "name": "Town",
            "id": "customer.address.area",
            "required": true
        },
        {
            "name": "Dealer Code",
            "id": "site.secondaryCode"
        },
        {
            "name": "Dealer Name",
            "id": "site.name",
            "required": true
        },
        {
            "name": "Dealer Phone No",
            "id": "site.contact.phoneNumber",
            "required": true
        },
        {
            "name": "Owner Name",
            "id": "site.contact.name",
            "required": true
        },
        {
            "name": "6 Digit code",
            "id": "cluster.secondaryCode",
            "required": true
        },
        {
            "name": "Area Status",
            "id":"cluster.name",
            "required": true
        },
        {
            "name":"TST Name",
            "id": "orgUser.technician.name",
            "required": true
        },
        {
            "name": "TST Phone No",
            "id": "orgUser.technician.uniqueId",
            "required": true
        },
        {
            "name": "TSO Name",
            "id": "orgUser.salesExec.name",
            "required": true
        },
        {
            "name": "TSO Phone",
            "id": "orgUser.salesExec.uniqueId",
            "required": true
        },
        {
            "name": "ASM ( Sales )Name",
            "id": "orgUser.asm.name",
            "required": true
        },
        {
            "name": "Area Sales Manager  Email",
            "id": "orgUser.asm.uniqueId",
            "required": true,
            "lowercase": true
        },

        {
            "name": "Area Service Manager Name",
            "id": "orgUser.serviceManager.name",
            "required": true
        },
        {
            "name": "Area Service Manager  Email",
            "id": "orgUser.serviceManager.uniqueId",
            "required": true,
            "lowercase": true
        },

        {
            "name": "BusinessManager Name",
            "id": "orgUser.bm.name",
            "required": true
        },
        {
            "name": "Business Manager  Email",
            "id": "orgUser.bm.uniqueId",
            "required": true,
            "lowercase": true
        },

        {
            "name": "Branch",
            "id": "orgUnit.branch.name",
            "required": true
        },
        {
            "name": "Region",
            "id": "orgUnit.region.name",
            "required": true
        }
    ]
}

module.exports = DataDef;
