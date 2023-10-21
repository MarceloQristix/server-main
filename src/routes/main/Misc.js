
const express = require('express');
const Validator = require('validator');
const Axios = require('axios');

module.exports= function (app) {

    const router = express.Router();

    const instance = Axios.create({
        baseURL: 'https://api.countrystatecity.in/v1/countries/',
        timeout: 10000,
        headers: {'X-CSCAPI-KEY': app.locals.credentials.countryStateCityAPIKey}
    });

    router.get('/state',
        function(req, res, next){
            let filter = req.query.filter? JSON.parse(req.query.filter): {};
            let countryCode= filter.countryCode || 'IN';

            instance.get(`${countryCode}/states`)
            .then(response => {
                let states = response.data;
                let start = 0;
                let end = states.length-1;
                let total = states.length;
                res.header('X-Total-Count', total);
                res.header('Content-Range', `records ${start}-${end}/${total}`);
                res.success(states);
            })
            .catch(error => {
                console.log('error', error);
                res.error({message:'Internal error', error: error});
            });
    });

    router.get('/city', function(req, res){
        let filter = req.query.filter? JSON.parse(req.query.filter): {};
        let stateCode = filter.state;
        let countryCode= filter.countryCode || 'IN';

        if (!stateCode) {
            res.error({message:'Required parameter state missing'});
            return;
        }

        instance.get(`${countryCode}/states/${stateCode}/cities`)
            .then(response => {
                let cities = response.data;
                let start = 0;
                let end = cities.length-1;
                let total = cities.length;
                res.header('X-Total-Count', total);
                res.header('Content-Range', `records ${start}-${end}/${total}`);
                res.success(cities);
            })
            .catch(error => {
                console.log('error', error);
                res.error({message:'Internal error', error: error});
            });
    });

    return router;
};
