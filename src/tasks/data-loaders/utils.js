
const FS= require('fs');

const stripComments= function (str) {
    return (str||'').replace(/(?:\r\n|\r|\n)/g,'')
        .replace(/\(.*\)/g, '')
        .replace(/\[.*\]/g, '');
};

const normalizeString= function(str, alphaNumericOnly=false){
    let searchValue= /[^a-zA-Z0-9\+\-]/g;
    if (alphaNumericOnly){
        searchValue= /[^a-zA-Z0-9]/g;
    }
    return (str?(str+''):'').toLowerCase().replace(searchValue, "");
};

const processDataDef= (type, alphaNumericOnly=false)=>{
    const dataDef= require(`../../config/data-loader/${type}.js`);
    const fields= dataDef.fields;
    let fieldMap= {};
    let colParser= {};
    fields.forEach((field, idx)=>{
        if (!field.id){ //ignore dummy columns
            return;
        }
        let columnId= normalizeString(stripComments(field.name), alphaNumericOnly);
        fieldMap[columnId]= field;
        (field.aliases ||[]).forEach((name)=>{
            columnId= normalizeString(name, alphaNumericOnly);
            fieldMap[columnId]= field;
        });
        if (field.fun){
            colParser[field.id]= field.fun;
        }
    });
    dataDef.fieldMap= fieldMap;
    dataDef.colParser= colParser;
    return dataDef;
}

const transformHeader= (headerString, dataDef, alphaNumericOnly=false) =>{
    let columns= headerString.split(',');
    let header= [];
    for (let index=0; index< columns.length; index++){
        let columnId= normalizeString(stripComments(columns[index]), alphaNumericOnly);
        if (dataDef.fieldMap[columnId]){
            header.push(dataDef.fieldMap[columnId].id);
        }
        else {
            header.push('');
        }
    }
    return header.join(',');
}

const write2File= (filePath, lines, cb) =>{
    let dataLines= [];
    lines.forEach((line)=>{
        dataLines.push(line.join(','));
    })
    FS.writeFile(filePath, dataLines.join('\n'),
        {
            encoding: "utf8",
        },
        cb);
}

module.exports= {
    stripComments,
    normalizeString,
    processDataDef,
    transformHeader,
    write2File
};
