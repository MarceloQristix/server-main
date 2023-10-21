
module.exports = function (app, doneCb){
    console.log("About to execute gen-qrcodes!!");
    const Asset = app.locals.models.Asset;
    const numQRCodes= 5000;
    let options={
        // orgUnitId: '624fa8363033290c198d9d89'
    };
    Asset.generateBulk(numQRCodes, options, (err)=>{
        console.log(err?err: 'success!');
        return doneCb(err);
    });
}
