const express = require('express');
const Async = require('async');
const Mongoose = require('mongoose');
const K = require("../../K");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class Asset extends AbstractCrud {
        constructor(groupPrefix) {
            let basePath = [groupPrefix, 'asset'].join('/');

            super(basePath, app.locals.models.Asset, true);

            //Default routes
            this.router.get('/', this.findAll.bind(this));
            this.router.get('/:id', this.findById.bind(this));
            this.router.post('/', this.create.bind(this));
            this.router.patch('/:id', this.update.bind(this));
            this.router.put('/:id', this.update.bind(this));
            this.router.delete('/:id', this.remove.bind(this));

            //additional routes
            this.router.put('/:id/basic', this.updateBasicDetails.bind(this));
            this.router.put('/:id/customer', this.updateCustomer.bind(this));
            this.router.put('/:id/technician', this.updateTechnician.bind(this));
            this.router.put('/:id/contact', this.updateContact.bind(this));
            this.router.put('/:id/address', this.updateAddress.bind(this));
            this.router.put('/:id/orgunit', this.updateOrgUnit.bind(this));
            this.router.put('/:id/accessories', this.updateAccessories.bind(this));
            this.router.put('/:id/status', this.updateStatus.bind(this));
            this.router.post('/:id/pdchecklist', this.logPDCheckList.bind(this));
            this.router.put('/:id/pdchecklist', this.logPDCheckList.bind(this));
            // this.router.put('/:id/readings', this.captureReadings.bind(this));
            this.router.put('/:id/register-ticket-v2', this.registerTicketV2.bind(this));

            this.router.put('/:id/send-status-update2customer', this.sendStatusUpdate2Customer.bind(this));
            this.router.put('/:id/send-welcome2customer', this.sendWelcome2Customer.bind(this));

            this.router.get('/:id/tickets', this.getServiceHistory.bind(this));
            this.router.get('/:id/events', this.getEvents.bind(this));
            this.router.get('/:id/contracts', this.getContracts.bind(this));

            this.router.post('/bulk-gen', this.generateBulk.bind(this));

            //open routes
            this.router.get('/open/:publicCode', this.getByPublicCode.bind(this));
            this.router.post('/open/:publicCode', this.updateByPublicCode.bind(this));
            this.router.post('/open/:publicCode/registerTicket', this.registerTicket.bind(this));
            this.router.get('/open/:publicCode/serviceHistory', this.getServiceHistory.bind(this));
            this.router.post('/open/:publicCode/readings', this.captureReadings.bind(this));

            app.use(this.basePath, this.router);
        }

        findById(req, res) {
            const OrgUnit = app.locals.models.OrgUnit;
            let id = req.params.id;
            let assetSettings = app.locals.Settings.asset;
            let openMenuItems;
            const ObjectId = Mongoose.Types.ObjectId;
            let asset;
            const loadAssetBySeqId = (next) => {
                if (ObjectId.isValid(id)) {
                    return next();
                }
                this.model.findOne({seqId: req.params.id},
                    (err, record) => {
                        if (err) {
                            return next({...K.ERROR.SERVER_INTERNAL, details: err});
                        }
                        asset = record.toObject();
                        return next();
                    });
            };

            const loadAssetByObjectId = (next) => {
                if (!ObjectId.isValid(id)) {
                    return next();
                }
                this.model.getDetails(req.params.id,
                    (err, record)=>{
                        if (err){
                            return next({...K.ERROR.SERVER_INTERNAL,details:err});
                        }
                        asset= record;
                        return next();
                    });
            }

            const loadOrgUnit = (next) => {
                if (!assetSettings.menuItemsAtOrgUnit) {
                    return next();
                }
                OrgUnit.findById(asset.orgUnit._id, (err, orgUnit) => {
                    if (err) {
                        return next();
                    }
                    if (!orgUnit) {
                        console.log('orgUnit mapping does not exist for Asset', asset.serialNumber);
                        return next();
                    }
                    if (!orgUnit.parent?._id) {
                        console.log('orgUnit parent mapping does not exist for dealership', orgUnit.code);
                        return next();
                    }
                    OrgUnit.findById(orgUnit.parent._id, (err, parentOrgUnit) => {
                        if (err) {
                            return next(err);
                        }
                        if (!parentOrgUnit) {
                            console.log('orgUnit parent not found', orgUnit.parent.code);
                            return next();
                        }
                        openMenuItems= [...assetSettings.open.menu.items];
                        for (let item of openMenuItems) {
                            if (item.id === 'feedback') {
                                if (parentOrgUnit.custom?.feedbackUrl) {
                                    item.link = parentOrgUnit.custom?.feedbackUrl;
                                }
                                break;
                            }
                        }
                        return next();
                    });
                });
            };

            Async.series([loadAssetBySeqId, loadAssetByObjectId, loadOrgUnit], (err) => {
                if (err) {
                    res.error(err);
                    return;
                }
                asset.openMenuItems = openMenuItems;
                res.success(asset);
            });
        }

        create(req, res) {
            const {customerId, productId, skuId, modelId, address, locatedAt, serialNumber} = req.body;
            let asset, customer, model, sku;

            const getDraftAsset = next => {
                this.model.find({'status': '01_draft', 'customer': null})
                    .sort({seqId: 1})
                    .limit(1)
                    .then(result => {
                        if (!result || result.length === 0) return next({message: 'Draft Asset Not Found!'});
                        asset = result[0];
                        return next();
                    })
                    .catch(err => next(err));
            };

            const getCustomer = next => {
                const Customer = app.locals.models.Customer;
                Customer.findById(customerId, (err, result) => {
                    if (err) return next(err);
                    if (!result) return next({message: 'Customer not found'});
                    customer = result;
                    return next();
                });
            };

            const getProduct = (next) => {
                if (!productId) {
                    return next();
                }
                const Product = app.locals.models.Product;
                const ProductModel = app.locals.models.ProductModel;
                Product.findById(productId, (err, product) => {
                    if (err) return next(err);
                    if (!product) return next({message: 'Product not found!'});
                    ProductModel.findById(modelId, (err, result) => {
                        if (err) return next(err);
                        if (!result) return next({message: 'Product Model Not Found!'});
                        model = result.getShortForm();
                        model.product = product.getShortForm();
                        return next();
                    });
                });
            };

            const loadSKU = (next) => {
                if (!skuId) {
                    return next();
                }
                const SKU = app.locals.models.SKU;
                SKU.findById(skuId, (err, record) => {
                    if (err) {
                        return next(err);
                    }
                    sku = record;
                    return next();
                });
            };

            const loadOrgUnit = next => {
                if (!app.locals.Settings.orgUnit.isEnabled) {
                    return next();
                }
                const OrgUnit = app.locals.models.OrgUnit;
                const orgMe = req.orgMe;
                if (!orgMe) {
                    console.log('orgme not found ')
                    return next();
                }
                if (!orgMe.orgUnit?._id) {
                    console.log('orgunit not found')
                    return next();
                }
                OrgUnit.findById(orgMe.orgUnit._id, (err, record) => {
                    if (err) {
                        return next(err);
                    }
                    if (!record) {
                        return next('fatal: orgunit mapped to user ont found');
                    }
                    asset.orgUnit = record.getShortForm();
                    asset.orgUnit.custom = {...record.custom};
                    asset.markModified('orgUnit');
                    return next();
                });
            };

            const saveAsset = next => {
                for (let key in req.body) {
                    asset[key] = req.body[key];
                    asset.markModified(key);
                }
                asset.customer = customer.getShortForm();
                asset.contact = {...customer.contact};
                if (model && model._id) {
                    asset.model = {...model};
                }
                if (address) {
                    asset.address = {...address};
                } else {
                    asset.address = {...customer.address};
                }
                if (sku) {
                    let skuObj = sku.toObject();
                    asset.sku = {
                        _id: sku._id,
                        name: sku.name,
                        model: sku.model,
                        variant: sku.variant,
                        attrs: {...skuObj.attrs}
                    };
                }
                asset.located = locatedAt;
                asset.serialNumber = serialNumber;
                asset.save(next);
            };

            Async.series([
                getDraftAsset,
                getCustomer,
                getProduct,
                loadSKU,
                loadOrgUnit,
                saveAsset
            ], (err) => {
                if (err) return res.error({error: err});
                return res.success(asset);
            });
        };

        getEvents(req, res) {
            this.model.getEvents(req.params.id, (err, events) => {
                if (err) {
                    return res.error({...K.ERROR.SERVER_INTERNAL, details: err})
                }
                return res.success(events);
            });
        }

        getServiceHistory(req, res) {
            this.model.getServiceHistory(req.params.id, (err, events) => {
                if (err) {
                    return res.error({...K.ERROR.SERVER_INTERNAL, details: err})
                }
                return res.success(events);
            });
        }

        getContracts(req, res) {
            this.model.getContracts(req.params.id, (err, events) => {
                if (err) {
                    return res.error({...K.ERROR.SERVER_INTERNAL, details: err})
                }
                return res.success(events);
            });
        }

        updateBasicDetails(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateBasicDetails(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        updateAddress(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateAddress(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        updateContact(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateContact(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        updateTechnician(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateTechnician(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        updateOrgUnit(req, res) {
            const id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateOrgUnit(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        updateAccessories(req, res) {
            const id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateAccessories(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        updateCustomer(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateCustomer(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        logPDCheckList(req, res) {
            let id = req.params.id;
            let by = req.orgMe;
            this.model.logPDCheckList(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        updateStatus(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.updateStatus(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        sendStatusUpdate2Customer(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            this.model.sendStatusUpdate2Customer(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        sendWelcome2Customer(req, res) {
            let id = req.params.id;
            let by = req.orgMe || req.user;
            let data = req.body || {};
            data.triggerWelcome = true;
            this.model.sendStatusUpdate2Customer(by, id, req.body, this.sendUpdateResponse.bind(this, req, res));
        }

        registerTicket(req, res) {
            const by = req.user;
            const Ticket = app.locals.models.Ticket;
            const publicCode = req.params.publicCode;
            const data = {...req.body};
            let tkt = undefined;
            let asset = undefined;

            const loadAsset = (next) => {
                this.findOneAssetByPublicCode(publicCode, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    asset = doc;
                    return next();
                });
            };

            const createTicket = (next) => {
                const {role} = req.orgMe || req.user;
                data.source = role === '_guest' ? 'customer_generated' : 'help_desk_created';
                data.asset = asset.toObject();
                data.asset._id = asset._id;
                data.customer = asset.customer;
                data.contact = data.contact || asset.contact;
                data.model = asset.model;
                data.address = asset.address;
                data.totalServiceCharge = data.services?.reduce((sum, item) => parseFloat(sum + item.price), 0);
                Ticket.create(req.orgMe || req.user, data, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    tkt = doc;
                    return next();
                });
            };

            let steps = [
                loadAsset,
                createTicket,
            ];
            Async.series(steps, (err) => {
                if (err) {
                    return res.error({error: err});
                }
                return res.success(tkt);
            });
        }

        registerTicketV2(req, res) {
            const by = req.orgMe || req.user;
            const Ticket = app.locals.models.Ticket;
            const Asset = app.locals.models.Asset;
            const id = req.params.id;
            const data = {...req.body};
            let tkt = undefined;
            let asset = undefined;

            const loadAsset = (next) => {
                Asset.findById(id, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    asset = doc;
                    return next();
                });
            };

            const createTicket = (next) => {
                const {role} = req.orgMe || req.user;
                data.source = 'customer_generated';
                data.asset = asset.toObject();
                data.asset._id = asset._id;
                data.customer = asset.customer;
                data.contact = data.contact || asset.contact;
                data.sku = asset.sku;
                Ticket.create(req.user, data, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    tkt = doc;
                    return next();
                });
            };

            let steps = [
                loadAsset,
                createTicket,
            ];
            Async.series(steps, (err) => {
                if (err) {
                    return res.error({error: err});
                }
                return res.success(tkt);
            });
        }

        captureReadings(req, res) {
            const by = req.orgMe || req.user;
            const publicCode = req.params.publicCode;
            const data = {...req.body};
            let asset = undefined;

            const loadAsset = (next) => {
                this.findOneAssetByPublicCode(publicCode, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    asset = doc;
                    return next();
                });
            };

            const addReadings = (next) => {
                asset.noteMeterReadings(by, data.readings, undefined, undefined, next);
            };

            const save = (next) => {
                asset.save(next);
            }

            let steps = [
                loadAsset,
                addReadings,
                save
            ];
            Async.series(steps, (err) => {
                if (err) {
                    return res.error({error: err});
                }
                return res.success(asset);
            });
        }

        findOneAssetByPublicCode(publicCode, callback) {
            this.model.findOne({publicCode: publicCode})
                .then((doc) => {
                    if (!doc) {
                        let parts = publicCode.split('-');
                        let seqId = parseInt(parts[1], 16);
                        this.model.findOne({seqId: seqId})
                            .then((doc2) => {
                                if (!doc2) {
                                    return callback({message: 'Asset not found'});
                                }
                                return callback(undefined, doc2);
                            })
                            .catch((err) => {
                                callback(err);
                            });
                        return;
                    }
                    return callback(undefined, doc);
                })
                .catch((err) => {
                    callback(err);
                });
        }

        updateByPublicCode(req, res) {
            const publicCode = req.params.publicCode;
            const data = req.body;
            let asset = undefined;
            let customer = undefined;

            console.log('>>>>>>>>>>>>>.', data);
            const loadAsset = (next) => {
                this.findOneAssetByPublicCode(publicCode, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    asset = doc;
                    return next();
                });
            };

            const createCustomer = (next) => {
                const Customer = app.locals.models.Customer;
                let customerId = data.customer.id
                let isNew = false;
                if (!customerId || (customerId === 'new')) {
                    isNew = true;
                    delete data.customer.id;
                }
                if (!isNew) {
                    Customer.findById(customerId, (err, doc) => {
                        if (err) {
                            return next(err);
                        }
                        if (!doc) {
                            return next({message: 'Customer not found!'});
                        }
                        customer = doc;
                        return next();
                    });
                    return;
                }
                const by = req.user._id || req.user.id;
                let custData = {
                    ...data.customer,
                    address: data.address,
                    contact: data.contact
                }
                Customer.doCreate(by, custData, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    customer = doc;
                    return next();
                });
            };

            const updateAssetInfo = (next) => {
                const ProductModel = app.locals.models.ProductModel;
                const Product = app.locals.models.Product;
                const by = req.user._id || req.user.id;
                const accessoriesInstalled = data.accessoriesInstalled;
                if (accessoriesInstalled) {
                    for (let i = 0; i < accessoriesInstalled.length; i++) {
                        let acc = accessoriesInstalled[i];
                        acc._id = Mongoose.Types.ObjectId(acc._id || acc.id);
                        acc.createdBy = by;
                    }
                    asset.markModified('accessoriesInstalled');
                }
                ProductModel.findById(data.modelId, (err, productModel) => {
                    if (err) {
                        return next(err);
                    }
                    if (!productModel) {
                        return next({message: 'product model not found!'});
                    }
                    Product.findById(productModel.product._id, (err, product) => {
                        if (err) {
                            return next(err);
                        }
                        if (!product) {
                            return next({message: 'product not found!'});
                        }
                        data.model = productModel.getShortForm();
                        data.model.product = product.getShortForm();
                        for (let key in data) {
                            asset[key] = data[key];
                            asset.markModified(key);
                        }
                        asset.customer = customer.getShortForm();
                        asset.address = {...customer.address};
                        asset.contact = {...customer.contact};
                        asset.save(next);
                    });
                });
            };
            let steps = [
                loadAsset,
                createCustomer,
                updateAssetInfo
            ];

            Async.series(steps, (err) => {
                if (err) {
                    return res.error({error: err});
                }
                return res.success(asset);
            });
        }

        getByPublicCode(req, res, next) {
            const Ticket = app.locals.models.Ticket;
            let publicCode = req.params.publicCode;
            let asset, assetId;

            let loadAsset = (next) => {
                this.findOneAssetByPublicCode(publicCode, (err, doc) => {
                    if (err) {
                        return next(err);
                    }
                    asset = doc.toObject();
                    assetId = doc._id;
                    asset.id = doc.publicCode;
                    next();
                });
            };

            let loadLastClosedSupportTicket = (next) => {
                Ticket.findOne({'asset._id': assetId, sType: 'support', status: '05_closed'},
                    {media: false},
                    {sort: {completedOn: -1}},
                    (err, record) => {
                        if (err) {
                            return next(err);
                        }
                        if (!record) {
                            return next();
                        }
                        asset.lastClosedSupportTicket = record.toObject();
                        return next();
                    });
            };

            // const loadLastClosedBreakdownTicket = next => {
            //     Ticket.findOne({ 'asset._id': assetId, sType:'breakdown', status: '05_closed' },
            //         { media: false },
            //         { sort: { completedOn: -1 } },
            //         (err,result) => {
            //             if(err) return next(err);
            //             if(!result) return next();
            //             asset.lastClosedBreakdownTicket = result.toObject();
            //             return next();
            //         }
            //     )
            // };

            let loadLastClosedConsumablesRequest = (next) => {
                Ticket.findOne({'asset._id': assetId, sType: 'consumable_req', status: '05_closed'},
                    {media: false},
                    {sort: {completedOn: -1}},
                    (err, record) => {
                        if (err) {
                            return next(err);
                        }
                        if (!record) {
                            return next();
                        }
                        asset.lastClosedConsumableRequest = record.toObject();
                        return next();
                    });
            };

            Async.series([
                loadAsset,
                loadLastClosedSupportTicket,
                loadLastClosedConsumablesRequest,
                // loadLastClosedBreakdownTicket
            ], (err) => {
                if (err) {
                    res.error(K.ERROR.SERVER_INTERNAL);
                    return;
                }
                res.success(asset);
            });
        }

        /*
         * @desc - max 100 draft assets, qr codes are generated
         * */
        generateBulk(req, res, next) {
            const Asset = app.locals.models.Asset;
            let count = 100;
            if (req.count && req.count < 100) {
                count = req.count;
            }
            Asset.generateBulk(count);
        }

    }

    return Asset;
};
