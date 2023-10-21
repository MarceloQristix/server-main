
module.exports= {
    DRAFT           : '01_draft',  // values are filled and awaiting approval
    APPROVED        : '02_approved',   // Both the parties agree for the terms -- not used as of now
    ACTIVE          : '03_active', // Post approval when the contract just crosses the start date
    EXPIRED         : '04_expired',     // Customer end date crossed
    CANCELLED       : '05_cancelled'
};
