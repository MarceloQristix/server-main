const Mongoose = require('mongoose');
const Schema = Mongoose.Schema;
const Path= require('path');
const ObjectId = Schema.ObjectId;
const Lodash = require('lodash');
const Sanitize = require("sanitize-filename");
const {mkdirpSync} = require("fs-extra");

const COLLECTION_NAME = 'file';

module.exports = function (app, doneCb) {

    const Db = app.locals.Db;
    const Settings = app.locals.Settings;
    const FILE_TYPE = {
        IMAGE: 'img',
        PDF: 'pdf',
        DOC: 'doc',
        XLS: 'xls',
        VIDEO: 'vid',
        OTHER: 'oth',
        PPT: 'ppt',
        AUDIO: 'aud'
    };

    const EXTENSION2TYPE= {
        "png": "img",
        "jpg": "img",
        "jpeg": "img",
        "gif": "img",
        "bmp": "img",
        "mp3": "aud",
        "ogg": "aud",
        "ogv": "vid",
        "avi": "vid",
        "vob": "vid",
        "mp4": "vid",
        "webm": "vid",
        "ppt": "ppt",
        "pptx": "ppt",
        "pdf": "pdf",
        "doc": "doc",
        "docx": "doc",
        "xls": "xls",
        "xlsx": "xls"
    };

    const schemaObj = new Schema({
        name: { //For display purpose
            type: String,
            trim: true,
            required: true
        },
        path: {
            type: String,
            required: true
        },
        fType: {
            type: String,
            default: FILE_TYPE.OTHER,
            enum: Object.values(FILE_TYPE)
        },
        extension:{
            type: String,
            lowercase:true
        },
        size: {
            type: Number,
            required: true,
        },
        mimetype: {
            type: String,
            required: true
        },
        md5: {  //checksum of the file
            type: String,
            required: true
        },
        tags: [String],
        ref: {
            _id: ObjectId,
            rType: {
                type: String,
                enum: ['site', 'ticket', 'task', 'campaign']
            }
        },
        isDeleted: {
            type: Boolean,
            default: false
        }
    });

    const formatQuery = function (query) {
        if (query.q) {
            let searchStr = query.q;
            let searchRegExp= new RegExp('.*' + searchStr + '.*', 'i');
            let conditions = {'name': {$regex: searchRegExp}}
            delete query.q;
            query = {...conditions};    //While searching other filters are purposefully ignored
        }
        if (query.refId){
            query['ref._id']= Mongoose.Types.ObjectId(query.refId);
            delete query.refId;
        }
        if (query.refType){
            query['ref.rType']= Mongoose.Types.ObjectId(query.refType);
            delete query.refType;
        }
        query.isDeleted= {$ne: true};
        return query;
    };

    schemaObj.pre('find', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('count', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('countDocuments', function () {
        this.setQuery(formatQuery(this.getQuery()));
    });

    schemaObj.pre('save', function (next) {
        if (!this.isNew) {
            return next();
        }
        this.fType= EXTENSION2TYPE[this.extension]||FILE_TYPE.OTHER;
        return next();
    });

    schemaObj.post('save', function (doc, next) {
        //FIXME: Sync in all the collections where there is replication.
        next();
    });

    schemaObj.virtual('url').get(function (){
        //FIXME: need to fix this hard coding of sites
        let dataDir= 'sites/files';
        if (this.ref.type === 'campaign'){
            dataDir= 'campaigns/media';
        }
        return `/data/org/${app.locals.id}/${dataDir}/${this.path}`;
    });

    schemaObj.virtual('fsPath').get(function (){
        //FIXME: need to fix this hard coding of sites
        return Path.resolve(app.locals.rootDir+'..'+`/data/org/${app.locals.id}/sites/files/${this.path}`);
    });

    schemaObj.statics.deleteFile= function (user, id, data, done) {
        this.findById(id, (err, record)=>{
            if (err){
                return done(err);
            }
            record.isDeleted= true;
            //FIXME: Delete file on disk as well
            record.save((err)=>{
                done(err, record);
            });
        });
    };

    schemaObj.statics.saveFile= function (user, data, done) {
        let Model= this;
        let fileObj= new Model({createdBy: user._id});
        console.log('fileObj', data);
        fileObj.ref= {...data.ref};
        fileObj.name= data.name
        fileObj.mimetype= data.mimetype;
        fileObj.size= data.size;
        fileObj.md5= data.md5;
        if (data.truncated){
            return done('file is oversize, got truncated!');
        }

        console.log('about to sanitize file name:', data.name);
        let sanitizedFileName= Sanitize(data.name);
        let extensionIndex= sanitizedFileName.lastIndexOf('.');
        let extension= sanitizedFileName.substr(extensionIndex+1);
        let fileNameWithoutExtension= sanitizedFileName.substr(0, extensionIndex);
        let targetFileName= fileNameWithoutExtension +'-'+Date.now();
        if (extension){
            targetFileName += '.'+extension;
        }

        let dataDir= app.locals.dirs.sitesFiles;
        if (!fileObj.ref?._id){
            dataDir= app.locals.dirs.campaignMedia;
            fileObj.ref.type= 'campaign';
        }
        let relFilePath= targetFileName;
        let targetDir= dataDir;

        if (fileObj.ref?._id) {
            relFilePath= fileObj.ref._id.toString()+'/'+targetFileName;
            targetDir= dataDir+fileObj.ref._id.toString();
            mkdirpSync(targetDir);
        }
        let targetPath= targetDir+'/'+ targetFileName;
        fileObj.extension= extension;
        fileObj.path= relFilePath;
        data.mv(targetPath, (err)=>{
            if (err){
                return done(err);
            }
            fileObj.save((err)=>{
                return done(err, fileObj);
            });
        });
    };

    const File = Db.model(COLLECTION_NAME, schemaObj);
    app.locals.models.File = File;

    schemaObj.set('toObject', {virtuals: true});
    schemaObj.set('toJSON', {virtuals: true});

    schemaObj.index({'name': 1});
    schemaObj.index({'path': 1}, {unique: true});
    schemaObj.index({'createdOn': 1});

    return doneCb();
};
