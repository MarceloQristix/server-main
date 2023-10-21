
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

    let by = app.locals.admin._id;

    const csvFilePath= process.argv[5];
    const csv= require('csvtojson')
    csv()
        .fromFile(csvFilePath)
        .then((jsonObj)=>{

		console.log(jsonObj)
        });
}
