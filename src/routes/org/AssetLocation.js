const express = require('express');
const Async = require('async');
const Mongoose = require('mongoose');
const K = require("../../K");

module.exports = function (app) {

    const AbstractCrud = require('../AbstractCrud')(app);

    class AssetLocation extends AbstractCrud {
        constructor(groupPrefix) {
            let basePath = [groupPrefix, 'asset-loc'].join('/');

            super(basePath, app.locals.models.Asset, true);

            //Default routes
            this.router.get('/', this.findAll.bind(this));
            this.router.get('/:id', this.findById.bind(this));

            app.use(this.basePath, this.router);
        }

        findById(req, res) {
            this.model.getDetails(req.params.id,
                (err, asset) => {
                    if (err) {
                        return res.error({...K.ERROR.SERVER_INTERNAL, details: err});
                    }
                    res.success(asset);
                });
        }

    }
    return AssetLocation;
};
