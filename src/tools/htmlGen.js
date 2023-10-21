

import EJS from 'ejs';

let ejsFile = '../../../website/v1/qrcodes/efl-qrcodes.html'

let data = {};
let options = {};
let numQRCodes = 140;
let urls= [];
for (let index=1; index<=numQRCodes; index++){
    urls.push(`qrcodes/${index}.png`);
}
data.urls = urls;
EJS.renderFile('./sheet.ejs', data, options, (err, str)=>{
    console.log(str);
});