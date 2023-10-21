
var mongoose= require("mongoose"),
    Schema  = mongoose.Schema,
    Types   = Schema.Types,
    async   = require("async");

var CSV2JSON= require('../lib/CSV2JSON');

var Service= function (app) {
    this._enabled= app.locals.isFeatureEnabled("pf.data_loader");
};

Service.prototype.init= function (app, callback) {
    if (!this._enabled) {
        setTimeout(callback, 1);
        return;
    }
    // if (mongo_where){
    //     table.mongo_where= mongo_where;
    // }
    var config= app.locals.cfg.master_data;

    var common_fields   = config.common_fields||[],
        collections     = config.collections;

    config.collection_map= {};
    config.table_map= {};

    collections.forEach(function(col){
        col.src.forEach(function (table) {
            var excludes= table.excludes || [],
                fields  = table.fields,
                indexes = table.indexes||[],
                schema_def= {},
                csv_schema= {};

            //Apply common fields to all the tables and check exclude while adding
            if (excludes[0] !== "*"){
                common_fields.forEach(function(cf){
                    if (excludes.indexOf(cf.name) === -1){
                        table.fields.push(clone(cf));
                    }
                });
            }

            for (var i=0, n=fields.length; i<n; i++){
                var field= fields[i];
                schema_def[field.name]= {type: Types[field.type||"String"]};
                if (field.name === "ID"){
                    schema_def[field.name].index= {unique:true};
                }
                csv_schema[field.name]= {name:field.name, required: field.required};
                if (field.target && field.required !== false){
                    csv_schema[field.name].required= true;
                }
                if(field.type === "Date"){
                    csv_schema[field.name].formatter= "custom";
                    csv_schema[field.name].format= function (val) {
                        var m=moment(val, "DD/MM/YY HH:MM");
                        return m.isValid() ? m.toDate(): undefined;
                    };
                }
            }
            if (table.ID_FIELD){
                if (!Array.isArray(table.ID_FIELD)){
                    schema_def[table.ID_FIELD].index= {unique:true};
                    schema_def[table.ID_FIELD].required=true;
                }
            }
            indexes.forEach(function(fld){
                schema_def[fld].index= true;
            });
            schema_def.sysModifiedOn= {type: Date};
            schema_def.src_file= {type: mongoose.Schema.ObjectId};
            table.collection= config.collection_prefix+ table.name;
            var instance_schema= new Schema(schema_def);
            if (table.ID_FIELD){
                var index_def= {};
                if (Array.isArray(table.ID_FIELD)){
                    table.ID_FIELD.forEach(function (id_field) {
                       index_def[id_field]= 1;
                    });
                }
                else {
                    index_def[table.ID_FIELD]= 1;
                }
                instance_schema.index(index_def, {unique: true});
            }
            instance_schema.index({"src_file":1});
            table.model= app.locals.mongo.model(table.name, instance_schema, table.collection);
            table.csv_schema= csv_schema;
            config.table_map[table.name]= table;
        });
        config.collection_map[col.id]= col;
    });

    this._cfg= config;
    this._app= app;
    setTimeout(callback, 1);
};

Service.prototype.loadFile= function (by, file, table_name, options, callback) {
    if (!this._enabled) {
        setTimeout(callback, 1);
        return;
    }
    var config= this._cfg;
    var is_done= false;
    var table = config.table_map[table_name];
    var updated=[], created= [];
    var src_file= options? options.src_file: undefined;
    if (!table) {
        console.error("Table with name : " + table_name + " does not exist!");
        return callback();
    }

    console.log("About to load data from : "+file +">>"+ table_name);
    var csv_file = file;//path.join(options.datadir, file.name + ".csv");
    var schema = table.csv_schema;
    var errors = [];

    var csv2json = new CSV2JSON(schema, csv_file);
    if (table_name === "PincodeMaster"){
        const LOC_TYPE= {
            "localcity" : "city", //Local City
            "upcountry" : "upcountry", //Upcountry
            "localtown" : "town"    //Local Town
        };
        var msg= "["+ ["Local City", "Local Town", "Upcountry"].join(", ") +"]";
        var UNIQ_ID_REGEXP= /[^a-z0-9_.@\-]/gi;

        var processUniqId= function(str){
            return str? str.trim().toLowerCase().replace(UNIQ_ID_REGEXP,''): '';
        };

        var validateAreaStatus= function(rows, next){
            var errors= [], warnings= [];
            for (var i=0, num_rows= rows.length; i< num_rows; i++){
                var row= rows[i];
                var area_status= processUniqId(row.area_status);
                if (!LOC_TYPE[area_status]){
                    errors.push({
                        field: "area_status",
                        ridx: row._idx-1,
                        msg: "should be one of "+msg
                    });
                }
            }
            var messages= errors.concat(warnings);
            return next(null, messages.length>0 ? messages : null);
        };

        csv2json.applyValidator(validateAreaStatus);
    }

    csv2json.on("warning", function (warn) {
        console.log(warn);
    });

    var summary= [];
    csv2json.on("end", function (data) {
        if (is_done){
            return;
        }
        if (errors.length > 0) {
            is_done=true;
            console.log("Please correct the below errors and try loading csv again");
            console.log(errors);
            console.log("error while loading : "+file.name);
            summary.push({status: "invalid", name: file.name});
            return callback(errors,summary);
        }
        console.log("Successfully loaded " + data.length + " rows from "+file.name);

        var Model   = table.model,
            counter = 0,
            total   = data.length;
        var updateRecord = function (row, next2) {
            counter++;
            var cond= {}, id_fields;
            if (table.ID_FIELD){
                if (!Array.isArray(table.ID_FIELD)){
                    id_fields= [table.ID_FIELD];
                }
                else {
                    id_fields= table.ID_FIELD;
                }
                id_fields.forEach(function (field) {
                   cond[field]= row[field];
                });
            }
            else {
                if (!row.ID){
                    cond= {"A": "B"};
                }
                else {
                    cond= {ID: row.ID};
                }
            }
            Model.findOne(cond, function (err, record) {
                if (err) {
                    return next2(err);
                }
                if (!record) {
                    created.push(row.ID);
                    console.log(counter, " of ", total, " insert");
                    record = new Model(row);
                }
                else {
                    updated.push(row.ID);
                    for (var key in row) {
                        record.set(key, row[key]);
                    }
                    console.log(counter, " of ", total, " update");
                }
                record.src_file= src_file;
                record.sysModifiedOn= new Date();
                record.save(next2);
            });
        };
        async.eachSeries(data, updateRecord, function (err) {
            if (err) {
                console.log(err);
                summary.push({status: "failure", name: file.name, updated: updated.length, created:created.length, total:total})
            }
            else {
                console.log("Successfully loaded"+file);
                var message= "Successfully loaded";
                summary.push({status: "valid", message: message, updated: updated.length, created:created.length, total:total, name:file})
            }
            console.log(summary);
            return callback(err,summary);
        });
    });
    csv2json.on("error", function (err) {
        errors.push(err);
        if (is_done){
            return;
        }
        is_done= true;
        if (errors.length > 0) {
            console.log("Please correct the below errors and try loading csv again");
            console.log(errors);
            console.log("error while loading : "+file);
            summary.push({status: "invalid", name: table.model, message:errors[0]});
            return callback(errors,summary);
        }
    });
    csv2json.convert();
};

Service.prototype.commit= function (by, file, master_type, options, callback) {
    require(options.loaders_dir+master_type)(by, this._app, this._cfg, master_type, options, callback);
};

Service.prototype.loadFilesInDir= function (dir, callback) {
    if (!this._enabled) {
        setTimeout(callback, 1);
        return;
    }
};

module.exports= function(app, done_cb){
    var service= new Service(app);
    service.init(app, function () {
        app.locals.services.data_loader= service;
        done_cb();
    });
};
