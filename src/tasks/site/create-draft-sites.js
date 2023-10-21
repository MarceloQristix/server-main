
module.exports = function (app, doneCb){
    console.log("About to create sites...");
    const Site = app.locals.models.Site;
    const numSites= 500;
    let options={
        // orgUnitId: '624fa8363033290c198d9d89'
    };
    Site.createMany(numSites, options, (err)=>{
        console.log(err?err: 'success!');
        return doneCb(err);
    });
}
