const guessFormat = require("moment-guess");
const Capitalize = require("capitalize");
const {getJsDateFromExcel} = require("excel-date-to-js");
const Moment = require("moment/moment");

global.DTFORMATS= {};
const noteDtFormat= (dt) =>{
    if (!dt){
        return;
    }
    let format;
    try {
        format= guessFormat(dt);
        global.DTFORMATS[format]= dt;
        console.log('NEW DATE FORMAT:', format, dt);
    }catch(e){
        try {
            format= guessFormat(Capitalize.words(dt));
        }
        catch(e){
            console.log('excepion while guessing date format', dt);
        }
    }
}


const toDate= function (val, format){
    if (!val){
        return '';
    }
    let dt;
    let exception;
    let mDt;
    if (typeof val === 'number'){
        try{
            dt= getJsDateFromExcel(val);
            mDt= Moment(dt);//.add(2, 'days').add('5', 'hours').add('30', "minutes");
        }
        catch(e){
            exception= e;
            if (exception){
                console.log('XLS_DT_EXTRACT_EXCEPTION', val);
                noteDtFormat(val);
            }
        }
    }
    else {  //assume to be string
        val= val.trim();
        if (val.indexOf('/') !== -1){
            mDt = Moment(val, 'DD/MM/YYYY');
        }
        else if (val.indexOf('.')!== -1){
            mDt = Moment(val, 'DD.MM.YY');
        }
        else {
            mDt= Capitalize.words(val);
            if (val.indexOf('-') !== -1){
                mDt = Moment(val, 'DD-MMM-YY');
            }
            else {
                if (val === '6dec222'){
                    val= '06-Dec-22';
                    mDt = Moment(val, 'DD-MMM-YY');
                }
                else if (val === '11jult22'){
                    val= '11-Jul-22';
                    mDt = Moment(val, 'DD-MMM-YY');
                }
                else {
                    mDt= undefined;
                    console.log('UNABLE_TO_PROCESS_DATE: ', val);
                }
            }
        }
    }
    if(mDt){
        if (mDt && mDt.isValid()){
            dt= format? mDt.format(format): mDt.toDate();
        }
        else {
            console.log('INVALID_DATE', val)
        }
    }
    console.log('DTTTT->', val, dt);
    return dt||val;
}

module.exports= {
    toDate
}