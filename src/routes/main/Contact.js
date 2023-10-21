
const express = require('express');
const Validator = require('validator');

module.exports= function (app) {

    const router = express.Router();

    console.log('About to set /contact routes');
    router.post('/get-started',
        function(req, res, next){
        const EmailService= app.locals.services.Email;
        let to = req.body.email||'';
        if (to.length === 0){
            res.error({message:'Email id can not be empty', code:1});
            return;
        }
        if (!to){
            res.error({message:'Email id can not be empty', code:1});
            return;
        }
        if (!Validator.isEmail(to)){
            res.error({message:'Invalid email id', code:2});
            return;
        }
        let subject = 'Equipment Service & Rental Software - QRisTix';
        let template = 'contact-us';
        EmailService.send(subject, template, {}, to, undefined, function (err){
            if (err){
                res.error({message:'Internal error', error: err});
                return;
            }
            res.success({data:''});
        });
    });

    router.post('/get-in-touch', function(req, res){
        const EmailService= app.locals.services.Email;
        let to = req.body.email||'';
        if (to.length === 0){
            res.error({message:'Email id can not be empty', code:1});
            return;
        }
        if (!to){
            res.error({message:'Email id can not be empty', code:1});
            return;
        }
        if (!Validator.isEmail(to)){
            res.error({message:'Invalid email id', code:2});
            return;
        }
        let subject = 'Equipment Service & Rental Software - QRisTix';
        let template = 'contact-us';
        let templateData= {body:{}};
        if (req.body.contact_name){
            templateData.body.name= req.body.contact_name;
        }
        EmailService.send(subject, template, {templateData}, to, undefined, function (err){
            if (err){
                res.error({message:'Internal error', error: err});
                return;
            }
            //Send Lead Details
            let subject = 'Lead Details :'+req.body.email;
            let template = 'lead-details';
            delete req.body._client;
            let templateData= {body:{dictionary: req.body}};
            EmailService.send(subject, template, {templateData}, 'anil.p@qristix.com', undefined, function (err) {
            });
            res.success({data:''});
        });
    });

    console.log('done setting up contact routes');
    return router;
};
