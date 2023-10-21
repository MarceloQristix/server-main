/**
 *  @description: Most of the schemas use this plugin for getting default functionality
 */
const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

const K= require('../../K');

module.exports = function defaultFields(schema, options) {

    if(schema.childSchemas){
        schema.childSchemas.forEach(e => e.$isChild = true);
    }
    if (schema.$isChild) {  //Skip child schemas
        return;
    }

    // Skip implicitly created schemas by mongoose such as array of objects
    // Refer: https://github.com/Automattic/mongoose/issues/4271
    if (schema.$implicitlyCreated){
        return;
    }

    schema.add({createdBy: {type: ObjectId, required: true}});
    schema.add({createdOn: {type: Date, default: Date.now}});
    schema.add({lastModifiedBy: {type: ObjectId}});
    schema.add({lastModifiedOn: {type: Date, default: Date.now}});
    schema.add({isDeleted: {type: Boolean}});    //soft delete

    schema.pre('save', function (next) {
        if (!this.isModified("lastModifiedOn")) {
            this.lastModifiedOn = new Date();
        }
        if (!this.lastModifiedBy) {
            this.lastModifiedBy = this.createdBy;
        }
        this.updatedPaths = this.modifiedPaths();
        this.wasNew = this.isNew;
        next();
    });

    if (!schema.methods.getShortForm) {
        schema.methods.getShortForm = function () {
            return {
                _id : this._id,
                name: this.name,
                displayName: this.displayName,
                code: this.code
            };
        };
    }

    if (!schema.statics.doCreate) {
        schema.statics.doCreate = function (by, data, cb) {
            let doSave = (processedData) =>{
                let doc = new this({
                    ...processedData,
                    createdBy: by,
                    createdOn: new Date()
                });
                doc.save((err) => {
                    if (err) {
                        return cb({...K.ERROR.MONGO_SAVE, details: err});
                    }
                    return cb(undefined, doc);
                });
            }
            if (this.processInputData) {
                this.processInputData(by, data, (err, processedData)=> {
                    if (err) {
                        return cb(err);
                    }
                    return doSave(processedData);
                });
            }
            else {
                doSave(data);
            }
        };
    }

    if (!schema.statics.doUpdate) {
        schema.statics.doUpdate = function (by, id, data, cb) {
            this.findById(id, (err, doc) => {
                if (err) {
                    return cb({...K.ERROR.MONGO_FIND, details: err});
                }
                if (!doc) {
                    return cb({...K.ERROR.DOC_NOT_FOUND});
                }

                const doSave= (processedData) =>{
                    for (let key in processedData) {
                        doc.set(key, processedData[key]);
                        if (typeof processedData[key] !== 'string' || typeof processedData[key] !== 'number'){
                            doc.markModified(key);
                        }
                    }
                    doc.lastModifiedBy= by;
                    doc.lastModifiedOn= new Date();
                    doc.save((err)=>{
                        if (err){
                            console.log('mongo save err', err);
                            return cb({...K.ERROR.MONGO_SAVE, details: err});
                        }
                        return cb(undefined, doc);
                    });
                }

                if (this.processInputData) {
                    this.processInputData(by, data, (err, processedData)=> {
                        if (err) {
                            return cb(err);
                        }
                        return doSave(processedData);
                    });
                }
                else {
                    doSave(data);
                }
            });
        };
    }

    if(!schema.statics.softDelete) {
        schema.statics.softDelete = function (by, id, cb) {
            this.findById(id, (err, doc) => {
                if (err) {
                    return cb({...K.ERROR.MONGO_FIND, details: err});
                }
                if (!doc) {
                    return cb(K.ERROR.DOC_NOT_FOUND);
                }
                doc.isDeleted = true;
                doc.save((err)=>{
                    if (err) {
                        return cb({...K.ERROR.MONGO_SAVE, details: err});
                    }
                    return cb(undefined, doc);
                });
            });
        };
    }

    if (!schema.statics.QFindById) {
        schema.statics.QFindById= function (id) {
            return this.findById(id);
        }
    }

};

