
module.exports = function (app, doneCb){
    console.log("About to execute gen-qrcodes!!");
    const Asset = app.locals.models.Asset;
    Asset.generateBulk(30, ()=>{
        return doneCb();
    });
}
