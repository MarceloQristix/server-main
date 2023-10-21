
module.exports = function (app, doneCb){
    console.log("About to execute gen-qrcodestickers for sites !!");
    const Site = app.locals.models.Site;
    const options = {
        seqIdEnd: 500
    };
    Site.generateQRCodeStickers(options, ()=>{
        return doneCb();
    });
};
