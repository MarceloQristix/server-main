
const express = require('express');
const Moment= require('moment');
const JWT= require('jsonwebtoken');

module.exports= function (app) {
    const Logger= app.locals.Logger;

    const router = express.Router();
    const User = app.locals.models.User;
    const Organization = app.locals.models.Organization;

    router.post('/login',
        function(req, res, next){
        //NOTE: req.user is not used as it contains all the user fields
        const sendAuthError= (err, statusCode) =>{
            Logger.error(err);
            return res.status(statusCode||500).json({error: err, success:false});
        };

        let authStrategy= 'local'
        if (req.body.otp){
            authStrategy= 'otp';
        }
        app.locals.passport.authenticate(authStrategy, {session: false}, function(err, user, passwordErr){
            if (err){
                Logger.error(err);
                return sendAuthError({message: "System Error"});
            }
            if (passwordErr){
                return sendAuthError(passwordErr, 400);
            }
            if (user.status === "blocked"){
                return sendAuthError({message:"User has been blocked"}, 400);
            }
            if (user.status === "pending"){
                return sendAuthError({message:"Pending Activation"}, 400);
            }
            req.logIn(user, function(err) {
                if (err) {
                    return sendAuthError({message: "Internal error", err});
                }
                const user= req.user;//session.passport.user;
                req.session.me= {...user};
                Organization.findById(user.memberOrgs[0], (err, org)=>{
                    if (err){
                        Logger.error(err);
                        return res.json({error: err, success:false});
                    }
                    if (!org){
                        Logger.error('No org found for the user!');
                        return res.json({error: 'no org found!', success:false});
                    }
                    let payload= {
                        userId: user._id||user.id,
                        orgId: org._id.toString(),
                        expires: Moment().add(3, 'months').toDate()
                    };
                    const authToken = JWT.sign(JSON.stringify(payload), app.locals.credentials.jwtSecret);

                    User.serializeUser()(user, (err, me)=>{
                        res.json({
                            me,
                            org,
                            authToken,
                            success:true
                        });
                    });
                });
                return;
            });
        })(req, res, next);
    });

    router.get('/logout', function(req, res){
        //NOTE: req.logout() does not work, below code is bulletproof
        req.session.destroy(function (err) {
            res.json({success:true});
        });
    });

    router.patch('/otp', function(req, res){
        let uniqueId = req.body.uniqueId;
        User.sendOTP(uniqueId, (err, data)=>{
            if (err){
                res.error(err);
                return;
            }
            res.success(data);
        });
    });

    router.patch('/device', function(req, res){
        let registrationToken = req.body.registrationToken;
	                req.user= req.session?.passport?.user;

        let userId = req.user.id||req.user._id;
        User.setPrimaryDevice(userId, registrationToken, ()=>{
            res.success({});
        });
    });

    router.patch("/password", function(req,res,next){
        const currentPassword = req.body.currentPassword;
        const newPassword     = req.body.newPassword;

        User.findById(req.session.me.id,function(err,record){
            if(err){
                return res.json({success:false,error:err})
            }
            record.authenticate(currentPassword, function(err,thisModel,passworderr){
                if(passworderr){
                    return res.json({success:false,error:passworderr})
                }
                record.setPassword(newPassword,function(err,thisModel,passworderr){
                    if(passworderr){
                        return res.json({success:false,error:passworderr})
                    }
                    record.save(function(error){
                        if(error){
                            return res.json({success:false,error:error});
                        }
                        return res.json({success:true,error:undefined})
                    });
                })
            })
        })
    });

    return router;
};
