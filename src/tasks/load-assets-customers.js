
const Async = require('async');
const Moment = require('moment');
const Mongoose = require('mongoose');

module.exports = function (app, doneCb){
    console.log("About to execute load-assets-customers!!");
    const Asset = app.locals.models.Asset;
    const Customer= app.locals.models.Customer;
    const ProductModel= app.locals.models.ProductModel;
    const Product = app.locals.models.Product;
    const ProductCategory= app.locals.models.ProductCategory;
    const Accessory= app.locals.models.Accessory;
    const OrgUser= app.locals.models.OrgUser;
    const primaryIdentifier= app.locals.Settings.asset.primaryIdentifier || 'serialNumber';

    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    const csv= require('csvtojson')
    csv()
        .fromFile(csvFilePath)
        .then((jsonObj)=>{

            const loadRecord = (data, next)=>{
                if ((!data.customer || !data.customer.name) &&(!data.site || !data.site.name) ){    //skip empty
                    return next();
                }
                console.log('>>>>>>>>>>>>>', data.rowNumber);

                let technician;
                const loadTechnician = (next2) =>{
                    if (!data.technician) {
                        return next2();
                    }
                    let searchStr= data.technician;
                    OrgUser.findOne({name: {$regex: new RegExp('.*'+searchStr+'.*', 'i')}}, (err, doc)=>{
                        if(err) {
                            return next2(err);
                        }
                        if (!doc){
                            console.log('techincian not found')
                            return;// next2();
                        }
                        technician= doc;
                        console.log('technician found')
                        return next2();
                    });
                };

                let productCategory;
                const loadOrCreateProductCategory = (next2) =>{
                    if(!data.category){
                        return next2();
                    }
                    ProductCategory.findOne({name:data.category.name}, {}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (!record){
                            productCategory= new ProductCategory({
                                createdBy:by
                            });
                        }
                        else {
                            productCategory= record;
                        }
                        productCategory.name= data.category.name;
                        productCategory.save(next2);
                    });
                };

                let product;
                const loadOrCreateProduct = (next2) =>{
                    if (!data.product){
                        return next2();
                    }
                    if (data.product.brand){
                        data.product.name= data.product.name +'/'+data.product.brand;
                    }
                    let name= data.product.name;
                    Product.findOne({'$or': [{code:name}, {name:data.product.name}, {name:name}]}, {}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (!record){
                            product= new Product({createdBy:by});
                        }
                        else {
                            product= record;
                        }

                        product.name= name;
                        product.code= name;
                        product.brand= data.product.brand;
                        if (productCategory) {
                            product.category= productCategory.getShortForm();
                        }
                        else {
                            product.set('category', undefined);
                        }
                        product.markModified('category');
                        if (!record){
                            product.save(next2);
                        }
                        else {
                            next2();
                        }
                    });
                };
                let productModel;
                const loadOrCreateProductModel = (next2) =>{
                    if (!data.model || !data.product){
                        return next2();
                    }
                    if (data.model.name === 'N/A' || data.model.name === 'NA' || data.model.name===''){
                        data.model.name=data.product.name;
                    }
                    if (!data.model.code){
                        data.model.code= data.model.name;
                    }
                    if (!data.model.name){
                        data.model.name= data.model.code;
                    }
                    ProductModel.findOne({'$or': [{code:data.model.code}, {name:data.model.name}]}, {}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (!record){
                            productModel= new ProductModel({createdBy:by});
                        }
                        else {
                            productModel= record;
                        }
                        for (let key in data.model){
                            productModel.set(key, data.model[key]);
                        }
                        productModel.product= product.getShortForm();
                        productModel.markModified('product');
                        productModel.save(next2);
                    });
                };

                let customer;
                const loadOrCreateCustomer= (next2) =>{
                    if (!data.customer||!data.customer.name){
                        console.log('customer not tagged')
                        return next2();
                    }
                    let cond= {name:data.customer.name}
                    if(data.customer.secondaryCode){
                        cond= {secondaryCode: data.customer.secondaryCode};
                    }
                    Customer.findOne(cond, {}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record){
                            customer= record;
                            if (technician){
                                customer.technician= technician.getShortForm();
                                customer.markModified('technician');
                                return customer.save(next2);
                            }
                            return next2();
                        }
                        customer= new Customer({
                            custType: 'business',
                            createdBy:by
                        });
                        for (let key in data.customer){
                            if (!data.customer[key]){
                                continue;
                            }
                            customer[key]=data.customer[key];
                            customer.markModified(key);
                        }
                        customer.save(next2);
                    });
                };

                let site;
                const Site= app.locals.models.Site;
                const loadOrCreateSite= (next2) =>{
                    if (!data.site || !data.site.name){
                        console.log('site not tagged')
                        return next2();
                    }
                    let cond= {name:data.site.name}
                    if(data.site.secondaryCode){
                        cond= {secondaryCode: data.site.secondaryCode};
                    }
                    Site.findOne(cond, {}, (err, record)=>{
                        if (err){
                            return next2(err);
                        }
                        if (record){
                            site= record;
                        }
                        else {
                            site= new Site({
                                createdBy:by
                            });
                        }
                        if(technician){
                            site.technician= technician.getShortForm();
                            site.markModified('technician');
                        }
                        for (let key in data.site){
                            site[key]=data.site[key];
                            site.markModified(key);
                        }
                        site.save(next2);
                    });
                };

                const mapAsset = (next2) =>{
                    if (!data.asset || !data.asset[primaryIdentifier]){
                        return next2();
                    }
                    let asset;
                    const loadExisting= (next3)=> {
                        let condition= { };
                        condition[primaryIdentifier]= data.asset[primaryIdentifier];
                        Asset.findOne(condition, {}, {sort: {seqId: -1}}, (err, record) => {
                            if (err) {
                                return next3(err);
                            }
                            if (record) {
                                asset = record;
                            }
                            return next3();
                        });
                    };

                    const loadDraft= (next3) =>{
                        if (asset){
                            return next3();
                        }
                        let condition= {
                            status:'01_draft'
                        };
                        condition[primaryIdentifier]= {$exists:false};
                        if (data.branch){
                            condition['orgUnit.name']= data.branch;
                        }

                        Asset.findOne(condition, {}, {sort:{seqId:1}}, (err, record)=>{
                            if (err){
                                return next3(err);
                            }
                            if (!record){
                                return next3('draft assets not found!');
                            }
                            asset = record;
                            return next3();
                        });
                    };
                    const isNumber= (value)=>{
                        return typeof value === 'number' && isFinite(value);
                    }

                    Async.series([loadExisting, loadDraft], (err)=>{
                        if (err){
                            return next2(err);
                        }
                        if (!asset){
                            return next2('Asset not found!');
                        }
                        if (!productModel){
                            return next2();
                        }
                        let record= asset;
                        if (data.asset.purchaseCost){
                            try {
                                data.asset.purchaseCost= parseFloat(data.asset.purchaseCost.replace(/[,:/]/g, ''));
                            }
                            catch(e) {
                                console.log('skipping purchaseCost', data.asset.purchaseCost);
                                delete data.asset.purchaseCost;
                            }
                            if (!isNumber(data.asset.purchaseCost)){
                                delete data.asset.purchaseCost;
                            }
                        }
                        if (data.asset.isCritical){
                            data.asset.isCritical= (data.asset.isCritical.toLowerCase() === 'c')? true: false;
                        }

                        for (let key in data.asset){
                            if (data.asset[key] === ''){
                                continue;
                            }
                            if ((asset.status !== '01_draft') && (key==='contact')){
                                continue;
                            }
                            record[key]= data.asset[key];
                        }
                        record.model= {
                            ...productModel.getShortForm(),
                            product: {...productModel.product}
                        };
                        console.log('product', record.model.product);
                        record.markModified('model');
                        if (customer){
                            record.customer = customer.getShortForm();
                            record.markModified('customer');
                        }
                        if (site){
                            record.site = site.getShortForm();
                            record.markModified('site');
                        }
                        record.isInstalled = true;
                        if (data.asset.installedOn){
                            try {
                                record.installedOn = Moment(data.asset.installedOn, 'DD/MM/YYYY');
                            }
                            catch(e){
                                //
                            }
                        }
                        if (data.meterTotal) {
                            record.latestMeterReadings= [
                                {
                                    "_id" : Mongoose.Types.ObjectId("6250d6b385dafd1a7f910253"),
                                    "name" : "Total",
                                    "code" : "MT0005",
                                    reading: data.meterTotal
                                }
                            ]
                        }

                        if (data.asset.address){
                            record.address= data.asset.address;
                            record.markModified('address');
                        }
                        else if (site){
                            record.address= site.address;
                            record.markModified('address');
                            if (site.technician){
                                record.technician= {...site.technician};
                                record.markModified('technician');
                            }
                        }
                        else if (customer){
                            record.address= customer.address;
                            record.markModified('address');
                            if (customer.technician){
                                record.technician= {...customer.technician};
                                record.markModified('technician');
                            }
                        }
                        if (!record.secondaryCode){
                            record.set('secondaryCode', undefined);
                        }
                        if (technician){
                            record.technician=technician.getShortForm();
                            record.markModified('technician');
                            console.log('>>>>technician', technician.getShortForm());
                        }
                        record.save(next2);
                        return;
                    });

                };

                const updateAccessory =(next2) =>{
                    if (!data.accessory) {
                        return next2();
                    }
                    if (!data.asset.serialNumber){
                        return next2();
                    }
                    let accessoryCode= '';
                    if (data.accessory) {
                        if (data.accessory.indexOf('V 110')) {
                            accessoryCode = 'Step Down Transformer 110V';
                        }
                        else if (data.accessory.indexOf('V 220')) {
                            accessoryCode = 'Step Down Transformer 220V';
                        }
                    }

                    Accessory.findOne({code:accessoryCode}, (err, accessory)=>{
                        if (err){
                            return next2(err);
                        }
                        if (!accessory) {
                            console.log('skipping accessory-- ', data.accessory);
                            return next2();
                        }
                        Asset.findOne({serialNumber: data.asset.serialNumber}, {}, (err, record)=>{
                            if (err){
                                return next2();
                            }
                            if (!record){
                                console.log('asset not found - ', data.asset.serialNumber);
                                return next2();
                            }
                            record.accessoriesInstalled= [{
                                ... record.getShortForm(),
                                installedOn: record.installedOn
                            }];
                            record.markModified('accessoriesInstalled');
                            record.save(next2);
                        });
                    });
                };

                Async.series([
                    loadTechnician,
                    loadOrCreateProductCategory,
                    loadOrCreateProduct,
                    loadOrCreateProductModel,
                    loadOrCreateCustomer,
                    loadOrCreateSite,
                    mapAsset,
                    // updateAccessory
                ], next);
            };
            Async.eachSeries(jsonObj, loadRecord, (err)=>{
                if (err){
                    console.log(err);
                }
                return doneCb(err);
            });
        });
}
