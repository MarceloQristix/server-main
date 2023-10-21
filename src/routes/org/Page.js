const Async = require("async");
const Moment = require("moment");
const EJS = require("ejs");
const FS = require("fs");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Page extends AbstractCrud {

        constructor(groupPrefix) {
            const basePath = [groupPrefix, 'page'].join('/');
            super(basePath, app.locals.models.page, false);
            this.router.post('/', this.create.bind(this));
            app.use(this.basePath, this.router);
        }

        create(req,res){

            const { assetId, pageId} = req.body;

            const orgSeqId = app.locals.id;
            let outDir = app.locals.dirs.pages;
            let fileName= pageId;
            let htmlOutput= '';
            let pageUrl= `/data/org/${orgSeqId}/pages/`

            if (pageId === 'asset-status'){
                let asset,customer, sku;

                const loadAsset= (next) => {
                    const Asset= app.locals.models.Asset;
                    Asset.findById(assetId, (err, record)=>{
                        if(err){
                            return next(err);
                        }
                        asset= record;
                        return next();
                    });
                };

                let orgUnit, parentOrgUnit;
                const loadOrgUnitInfo= (next) =>{
                    if (!asset.orgUnit?._id){
                        return next();
                    }
                    const OrgUnit= app.locals.models.OrgUnit;
                    OrgUnit.findById(asset.orgUnit?._id, (err, record)=>{
                        if (err){
                            return next(err);
                        }
                        if (!record){
                            return next('orgunit not found!');
                        }
                        orgUnit= record;
                        if (!record.parent?._id){
                            return next('parent OrgUnit not found!');
                        }
                        OrgUnit.findById(record.parent._id, (err, record)=>{
                            if (err){
                                return next(err);
                            }
                            if (!record){
                                return next('parent OrgUnit record not found!');
                            }
                            parentOrgUnit= record;
                            return next();
                        });
                    });
                };

                const loadCustomer = (next) => {
                    if (!asset.customer?._id){
                        return next();
                    }
                    const Customer = app.locals.models.Customer;
                    Customer.findById(asset.customer._id,(err,record) => {
                        if(err) {
                            return next(err);
                        }
                        if(!record){
                            return next({ message: 'Customer not found' });
                        }
                        customer = record;
                        return next();
                    });
                };

                const loadSKU = (next) => {
                    if (!asset.sku?._id){
                        return next();
                    }
                    const SKU = app.locals.models.SKU;
                    SKU.findById(asset.sku._id,(err,record) => {
                        if(err) {
                            return next(err);
                        }
                        sku= record;
                        return next();
                    });
                };

                const generatePage = (next) => {
                    const Settings= app.locals.Settings;
                    let htmlFile = `${outDir}/${fileName}-${assetId}.html`;
                    let data = {};
                    let options = {};

                    data.feedbackUrl= parentOrgUnit?.custom?.feedbackUrl;

                    data.today= Moment().format('MMMM Do YYYY');
                    data.logo= Settings.logo;
                    data.imagesBaseUrl='/images/page/asset-status';
                    data.baseUrl = Settings.baseUrl;
                    data.baseUrl= data.baseUrl.substr(0,data.baseUrl.length-1);
                    data.title= `Booking Status - ${asset.serialNumber}`;
                    data.asset= asset;
                    data.sku= sku;
                    data.customer= customer;
                    data.bookingSequenceNumber= asset.custom?.bookingSequenceNumber;
                    data.bookingDate= Moment(asset.installedOn).format('dddd, MMMM Do YYYY');
                    pageUrl= data.baseUrl+ pageUrl+`${fileName}-${assetId}.html`;
                    let elapsedWeeks= Moment().diff(asset.installedOn, 'week');
                    let minWaitingWeeks= asset.custom?.minWaitingPeriodInWeeksQuoted - elapsedWeeks;
                    if (minWaitingWeeks<0){
                        minWaitingWeeks= 0;
                    }
                    let maxWaitingWeeks= asset.custom?.maxWaitingPeriodInWeeksQuoted - elapsedWeeks;
                    if (maxWaitingWeeks <0){
                        maxWaitingWeeks= 0;
                    }
                    if (!asset.custom){
                        asset.custom= {};
                    }
                    data.statusLastUpdatedOn= Moment(asset.custom?.currentUpdatedOn).format('MMMM Do YYYY');
                    data.waitingPeriod= (maxWaitingWeeks === 0) ? '0 Weeks': (minWaitingWeeks + ' - '+ maxWaitingWeeks + ' Weeks');
                    data.orgUnit= asset.orgUnit || {name: "Galaxy Toyota Moti Nagar"}

                    EJS.renderFile('tpls/html/booking-status-update.ejs', data, options, (err, tplOutput)=>{
                        if(err){
                            console.log(err);
                            return next(err);
                        }
                        htmlOutput= tplOutput;
                        FS.writeFile(htmlFile, htmlOutput, 'utf8', next);
                    });
                };

                Async.series([
                    loadAsset,
                    loadCustomer,
                    loadSKU,
                    loadOrgUnitInfo,
                    generatePage
                ],(err) => {
                    if(err) return res.error({error: err});
                    return res.success({url:pageUrl});
                });

            }
            else if (pageId === 'contact'){

            }

        };

    }
    return Page;
};
