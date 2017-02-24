'use strict'
var db = require('../../../index');
const crypto = require('crypto');


module.exports = {
    generateToken: (data, callback) => {
        let col = db.connection.collection('tokens'); // init collection with user and messages id's
        crypto.randomBytes(48, (err, buffer) => {
            var token = buffer.toString('hex');
            col.insertOne({
                token: token,
                printer: data
            }, (err, r) => {
                if (err)
                    return callback(err, 500);

                return callback({token: token, code: 20000});
            })
        });
    },
    authenticate: (data, callback) => {
        let col = db.connection.collection('tokens'); // init collection with user and messages id's
        col.find({token: data}).limit(1).next((err, doc) => {
            if (err)
                return callback(err, 500);

            if (!doc) {
                return callback({messages: 'Undefined token', code: 40000}, 400);
            }
            else {
                return callback({message: 'Success', code: 20000});
            }
        })
    },
    getUnprintedMessages: (data, callback) => {
        let col = db.connection.collection('raw_messages');
        col.find({print_status: 'NOT_PRINTED'}).toArray((err, docs) => {
            if (err)
                return callback(err, 500);

            return callback(docs);
        })
    },
    updatePrintStatus: (data, callback) => {
        let col = db.connection.collection('raw_messages');
        col.updateOne({_id: Number(data.id)}, {$set: {print_status: data.status.toString()}}, (err, doc) => {
            if (err)
                return callback(doc, 500);
                
            return callback({message: 'Message with id ' + data.id + ' modified successfull', code: 20000});
        })
    }
}
