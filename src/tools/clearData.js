db.accessories.remove({})
db.assets.remove({})
db.attendances.remove({})
db.commonproblems.remove({})
db.consumables.remove({})
db.contracts.remove({})
db.customers.remove({})
db.eventlogs.remove({})
db.meter_types.remove({})
db.orgunits.remove({})
db.partrequisitions.remove({})
db.product_categories.remove({})
db.productmodels.remove({})
db.products.remove({})
db.ratecards.remove({})
db.reports.remove({})
db.seq_counters.remove({})
db.services.remove({})
db.spareparts.remove({})
db.tickets.remove({})


//for tkm following commands used for data clearance

db.customers.remove({})
db.seq_counters.update({prefix:'CUST'}, {$set:{seqId:0}})
var globalCustomerUserIds= db.orgusers.distinct("globalUser._id", {role:"customer"})
db.orgusers.remove({role:"customer"})
db.skus.remove({})

//use saas
//db.users.remove({_id:{$in:globalCustomerUserIds}})

