
const Async = require('async');
const XLSX= require('xlsx');
const {response} = require("express");
const ExcelJS = require('exceljs');

module.exports = function (app, doneCb){
    console.log('Generate Technician Performance stats', new Date());

    const appBaseUrl=`${app.locals.credentials.baseUrl}appv2`;

    let by = app.locals.admin;
    const TktStats= app.locals.models.TktStats;
    let rows= [];
    let emptyRow= [];
    let technicians;
    let dayWiseRecords;
    let statsFields;
    let days;

    const computeStats= (next)=>{
        TktStats.computeDailyTechnicianStats(by, next);
    };

    let links= [];
    const prepareData= (next)=>{
        TktStats.getTechnicianPerformanceData(undefined, undefined, (err, data)=>{
            technicians= data.technicians;
            dayWiseRecords= data.technicianDayWiseRecords;
            statsFields= data.def;
            days= data.days;

            let headerRow1= [
                '#',
                'Day'
            ];
            let headerRow2= [
                '',
                '',
            ];
            technicians.forEach((technician)=>{
                headerRow1.push(technician.name);
                statsFields.slice(1).forEach((field)=>{
                    headerRow1.push('');
                });
                statsFields.forEach((field)=>{
                    headerRow2.push(field.label);
                });
            });
            headerRow1.forEach(()=>{
                emptyRow.push('');
            });
            let index=0;
            for (let day of days) {
                index++;
                let row= [];
                row.push(index);
                row.push(day.name);
                let colIndex= 1;
                for (let technician of technicians){
                    for(let field of statsFields){
                        colIndex++;
                        if (!dayWiseRecords[day.id][technician.id]?.stats[field.id]){
                            row.push('-');
                            continue;
                        }
                        let tickets= [];
                        for (let entity of dayWiseRecords[day.id][technician.id]?.metaData[field.id].entities){
                            tickets.push(entity.code);
                        }
                        let cellVal=
                        row.push(tickets.join(', '));
                        links.push({
                            r: index+3,
                            c: colIndex,
                            l: getTargetLink(day.id, technician.id, field.id)
                        });
                    }
                }
                rows.push(row);
            }
            rows.unshift(headerRow2);
            rows.unshift(headerRow1);
            return next();
        });
    };

    const getTargetLink= (day, technicianId, statId)=>{
        let filter= JSON.stringify({statId: [day, technicianId, statId].join('.')});
        let url= appBaseUrl+'/ticket/';
        return url+'?filter='+encodeURI(filter);
    }


    const generateXLS= (next)=>{
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, "DCR");
        XLSX.utils.sheet_add_aoa(worksheet, [emptyRow], { origin: "A1" });
        if(!worksheet["!merges"]) {
            worksheet["!merges"] = [];
        }
        let colIndex=2;
        for (let technician of technicians){
            let range= {
                s: { r: 1, c: colIndex }, // s ("start"): c = 1 r = 2 -> "B3"
                e: { r: 1, c: colIndex+statsFields.length-1 }  // e ("end"):   c = 4 r = 3 -> "E4"
            }
            colIndex+= statsFields.length
            worksheet["!merges"].push(range);
        }
        links.forEach((link)=>{
            let cellName= getCellName(link.r, link.c);
            worksheet[cellName].l= {Target:link.l};
        });
        const DCRFilePath= `${app.locals.dirs.reports}/DCR.xlsx`;
        XLSX.writeFile(workbook, DCRFilePath, { compression: true });
        next();
    };

    let startAlphabet= 'A';
    let Alphabets= [];
    for (let index=0; index<26; index++){
        Alphabets.push(String.fromCharCode(startAlphabet.charCodeAt(0)+index));
    }

    for (let index=0; index<26; index++){
        Alphabets.push('A'+String.fromCharCode(startAlphabet.charCodeAt(0)+index));
    }

    for (let index=0; index<26; index++){
        Alphabets.push('B'+String.fromCharCode(startAlphabet.charCodeAt(0)+index));
    }
    for (let index=0; index<26; index++){
        Alphabets.push('C'+String.fromCharCode(startAlphabet.charCodeAt(0)+index));
    }

    const getAlphabet= (alphabetNumber)=>{
        let charCodeOfA= 'A'.charCodeAt(0);
        return String.fromCharCode(charCodeOfA+alphabetNumber);
    }

    const getCellName= (r, c) =>{
        return Alphabets[c]+r;
        //TODO: need to make below code work
        let onesLevelCode= (c+1)%26;
        let tensLevelCode= Math.floor((c+1)/26);
        let name= (tensLevelCode>0 ? getAlphabet(tensLevelCode):'')+ getAlphabet(onesLevelCode-1)+r;
        return name;
    };

    let steps= [
        computeStats,
        prepareData,
        generateXLS
    ]
    Async.series(steps, (err)=>{
        doneCb(err);
    });
}
