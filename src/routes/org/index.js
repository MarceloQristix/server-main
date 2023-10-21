const Mongoose= require('mongoose');

module.exports= function (app, doneCb){
    app.use('/', function (req, res, next) {
        //TODO: check access privileges for the org api
        const OrgUser= app.locals.models.OrgUser;
        if (!req.user){
            return next();
        }
        let cond= {};
        if (req.orgMe){
            cond= {_id: Mongoose.Types.ObjectId(req.orgMe.id||req.orgMe._id)}
            console.log('via reqOrgMe')
        }
        else if (req.user.orgMe){
            cond= {_id: Mongoose.Types.ObjectId(req.user.orgMe.id)}
            console.log('via orgMe')
        }
        else {
            cond= {'globalUser._id': Mongoose.Types.ObjectId(req.user._id||req.user.id)}
            console.log('via globaluser, No orgMe');
        }
        OrgUser.findOne(cond, (err, record)=>{
            if (err){
                return next(err);
            }
            if (!record){
                console.log('no orgme record found', JSON.stringify(cond));
                return next();
            }
            req.orgMe= record.toObject();
            req.orgMe._id= record._id;
            req.orgMe.roleDef= app.locals.Settings.roleMap[record.role];
            return next();
        });
    });

    const CONTROLLERS= [
        'Accessory',
        'Asset',
        'AssetLocation',
        'Consumable',
        'Customer',
        'Contract',
        'EventLog',
        'OrgUnit',
        'OrgUser',
        'Product',
        'ProductCategory',
        'ProductModel',
        'Profile',
        'Dashboard',
        'Report',
        'SparePart',
        'Ticket',
        'MeterType',
        'Maintenance',
        'CustomerAssets',
        'CommonProblem',
        'Site',
        'Service',
        'Attendance',
        'RateCard',
        'Vendor',
        'PartRequisition',
        'Material',
        'Cluster',
        'SKU',
        'Form',
        'File',
        'Me',
        'Page',
        'Campaign',
        'Notification',
        'PurchaseOrder',
        'State',
        'City',
        'TechnicianPerformance',
        'Task',
        'OrgUnitProfile',
        'TechnicianLocation',
        'Enquiry',
        'OrgUnitRunningStats'
    ];
    for (let index=0; index<CONTROLLERS.length; index++){
        const ControllerClass = require(['.', CONTROLLERS[index]].join('/'))(app);
        let controller= new ControllerClass('');
    }
    doneCb();
}
