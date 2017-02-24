'use strict'
var db = require('../../../index');
const fs = require('fs');
const jwt = require('jsonwebtoken'); // JSON Web Token
const pdf = require('html-pdf'); // HTML to PDF convert module
const pdfConverterOptions = { format: 'Letter' }; // HTML to PDF options

// For passwords hashing
const bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = {
    getListOfMessages: (user, count, page, fields, category, key, callback) => {
        // REVIEW: This service uses as universal for inbox, outbox and trash messages

        let col = db.connection.collection('messages'); // init collection with user and messages id's
        let usr = db.connection.collection('users'); // init users collection
        let rawMessagesCollection = db.connection.collection('raw_messages'); // init collection with messages
        let fieldsQuery = new Object();
        let findObject = new Object();
        let login = (user.user).toString().toLowerCase();

        if (fields) {
            fields = fields.split(',');
            fields.map((item) => {
                return fieldsQuery[item] = true;
            })
        }

        if (!page) {
            count = 10;
            page = 1;
        }
        else if (!count) {
            count = 10;
        }

        col.find({_id: login}).limit(1).next((err, result) => {
            if (err) return callback(err, 500)
            else if (!result) {
                return callback({message: 'Can\'t find any data for this user', code: 40000}, 400)
            }
            else if (!result[key]) {
                return callback({message: 'Undefined storage key. Current key is ' + key, code: 40000}, 400);
            }

            if (result[key].length == 0) { return callback({messagesCount: result[key].length, page: page, messages: [], totalCount: result[key].length}); }

            result[key].map((item, i) => {
                return result[key][i] = Number(item);
            })

            findMessagesInRawList(result[key]);
        })

        let findMessagesInRawList = (query) => {
            rawMessagesCollection.find({_id: {$in: query}, category: category || 'general'}, fieldsQuery).sort({date: -1}).skip((page - 1) * count).limit(count).toArray((err, docs) => {
                let sendersList = new Array();
                docs.forEach((item) => {
                    sendersList.push(item.sender);
                    if (item.attachment) {
                        item.attachment.map((attach, i) => {
                            attach.downloadLink = '/api/public/v1/messages/download/' + item._id + '-' + i;
                            return delete attach.data;
                        })
                    }
                    else {
                        return true;
                    }
                })

                usr.aggregate([
                    { $match: {login: {$in: sendersList}}}
                ], (err, r) => {
                    docs.forEach((item, i, arr) => {
                        r.map((u, ind) => {
                            if (item.recipient == u.login) {
                                return item.recipient_image = u.image;
                            }
                            else { return }
                        })
                    })

                    return callback({messagesCount: docs.length, page: page, messages: docs, totalCount: query.length, code: 20000});
                })
            })
        }
    },
    findMessageById: (user, messageID, callback) => {
        let rawMessagesCollection = db.connection.collection('raw_messages'); // init collection with messages
        let usersCollection = db.connection.collection('users');

        let login = (user.user).toString().toLowerCase();
        let attachment = new Array();
        let filename = messageID + '_' + login + '_' + (new Date().getTime() + 86400000) + '.pdf';

        rawMessagesCollection.find({_id: Number(messageID)}).toArray((err, docs) => {
            if (docs.length == 0) {
                return callback({messages: "Undefined message ID - " + messageID, code: 40000}, 400);
            }

            usersCollection.find({login: login}).limit(1).next((err, doc) => {
                if (err) { return callback({message: "Internal error", code: 50000, err: err}, 500); }
                docs[0].sender_image = doc.image;

                docs[0].attachment.map((attach, i) => {
                    return attachment.push('/api/public/v1/messages/download/' + messageID + '-' + i)
                })

                docs[0].attachment = attachment;

                var dir = fs.readdirSync('./pdf_messages');
                for (var i = 0; i < dir.length; i++) {
                    var id = dir[i].split('_')[0];
                    if (id == messageID) { docs[0].pdf_link = '/api/public/v1/messages/pdf/' + dir[i]; }
                }

                if (!docs[0].pdf_link) {
                    docs[0].pdf_link = '/api/public/v1/messages/pdf/' + filename;

                    pdf.create(docs[0].html, pdfConverterOptions).toFile('./pdf_messages/' + filename, function(err, res) {
                        if (err) return console.log(err, 500);
                        callback({message: docs[0], code: 20000});
                    });
                }
                else {
                    callback({message: docs[0], code: 20000});
                }
            })
        })
    },
    createMessage: (user, body, attachments, callback) => {
        // REVIEW: this method get requested message concatenate body with attachments.
        // After concatenation, this method find recipient in users and get them ID.
        // Open {@messages} collection and add message ID in inbox for receiver user, and in outbox for current user

        let rawMessagesCollection = db.connection.collection('raw_messages'); // init collection with messages
        let col = db.connection.collection('messages'); // init collection with user and messages id's
        let bill = db.connection.collection('bills');
        let usersCollection = db.connection.collection('users');
        let login = (user.user).toString().toLowerCase();
        let price = (body.type == 'email') ? -0 : -2;

        let files = new Array();
        if (attachments) {
            attachments.forEach((item, i) => {
                var buffer = fs.readFileSync(item.destination + item.filename);
                files.push({
                    data: buffer,
                    originalName: item.originalname,
                    mimetype: item.mimetype,
                    size: item.size
                });

                fs.unlink(item.destination + item.filename, (err) => {
                    if (err) throw err;
                });
            })
        }

        if (!body.category) { body.category = 'general'; }

        // Add cutom body fields
        body.date = new Date(); // add ISO data
        body.attachment = files; // add attachment to general message data;
        body._id = Math.floor(Math.random() * (99999999 - 10000000)) + 10000000; // add unique ID for this message
        body.print_status = 'NOT_PRINTED'; // set for all new messages;

        var promises = new Array();
        var recipient_logins = new Array(); //array of clean recipients

        var recipients = body.recipient.split(';');
        recipients.forEach((item, i, arr) => {
            // Empty string bug fix
            if (item == '') { return false; }

            // detect custom address: 'FIRST_NAME LAST_NAME, POST_CODE, COUNTRY, CITY, ADDRESS'
            if (item.split(':').length == 1 && item.split(':')[0].split(',').length > 1) {
                // HERE WILL BE ADD FUNCTION WHICH GENERATE AND SENT MESSAGE TO PHISICAL ADDRESS
                // console.log('Message have recipient which unregistered in Tilda system. Message ID: ' + body._id);
            }
            // detect case with only user login
            else if (item.split(':').length == 1) {
                let dirty_login = item.split(':')[0];
                let clean_login = dirty_login.split('~')[0].toLowerCase();

                promises.push(
                    new Promise((resolve, reject) => {
                        usersCollection.find({login: clean_login}).limit(1).next((err, doc) => {
                            if (err) return callback(err, 500);
                            else if (!doc) {
                                return reject({messages: item + ' is not defined in Tilda system', code: 40000});
                            }
                            else {
                                resolve(doc.login);
                            }
                        })
                    })
                )
            }
            // detect all other cases
            // 'test22~post.com:home',
            // 'test22~post.com:work',
            // 'test22~post.com:FIRST_NAME LAST_NAME, POST_CODE, COUNTRY, CITY, ADDRESS'
            else if (item.split(':').length > 1) {
                let dirty_login = item.split(':')[0];
                let clean_login = dirty_login.split('~')[0].toLowerCase();

                promises.push(
                    new Promise((resolve, reject) => {
                        usersCollection.find({login: clean_login}).limit(1).next((err, doc) => {
                            if (err) return callback(err, 500);
                            else if (!doc) {
                                return reject({messages: item + ' is not defined in Tilda system', code: 40000});
                            }
                            else {
                                resolve(doc.login);
                            }
                        })
                    })
                )
            }
        })

        Promise.all(promises).then((data) => {
            // remove repeated logins
            data.forEach((item, i, arr) => {
                if (recipient_logins.indexOf(item) == -1)
                    recipient_logins.push(item);
            })

            checkBilling();
        }, (err) => {
            return callback(err, 400);
        })

        var checkBilling = () => {
            bill.findOneAndUpdate(
                {_id: login, balance: { $gte: 2 }},
                {
                    $inc: { balance: price},
                    $push: {
                        history: {
                            currency: "EUR",
                            amount: price,
                            payment_type:null,
                            card_num: null,
                            date: new Date(),
                            type: 'Send letter'
                        }
                    }
                }, {}, (err, r) => {
                if (err) return callback(err, 500);

                if (!r.value) { return callback({message: 'Insufficient funds in the account', code: 40000}, 400); }

                return createRecords();
            })
        }

        var createRecords = () => {
            var promises = new Array();

            // add message ID for each recipient to they inbox arrays
            recipient_logins.forEach((item, i) => {
                promises.push(
                    new Promise(function(resolve, reject) {
                        col.findAndModify({_id: item}, [], {$push: {inbox: body._id}}, (err, doc) => {
                            if (err) return reject(err);
                            return resolve();
                        })
                    })
                )
            })

            // Update this user outbox
            promises.push(
                new Promise(function(resolve, reject) {
                    col.findAndModify({_id: login}, [], {$push: {outbox: body._id}}, (err, doc) => {
                        if (err) return reject(err);
                        return resolve();
                    })
                })
            )

            // Save original message
            promises.push(
                new Promise(function(resolve, reject) {
                    rawMessagesCollection.insertOne(body, {}, (err, result) => {
                        if (err) return reject(err);
                        return resolve();
                    })
                })
            )

            Promise.all(promises).then(() => {
                callback({message: 'Message created sucessfully', messageID: body._id, code: 20000});
            }, (err) => {
                callback(err, 500);
            })
        }
    },
    downloadFile: (user, filename, callback) => {
        var file = filename.split('-');

        const MESSAGE_ID = Number(file[0]);
        const FILE_INDEX = Number(file[1]);

        let rawMessagesCollection = db.connection.collection('raw_messages'); // init collection with messages
        rawMessagesCollection.find({_id: MESSAGE_ID}, {attachment: true}).toArray((err, docs) => {
            var attach = docs[0].attachment[FILE_INDEX];
            fs.writeFile("./attachments/" + attach.originalName, attach.data.buffer, function(err) {
                if(err) return callback(null, null, 500);
                return callback(attach.originalName, {root: "./attachments/"});
            });
        })
    },
    addToTrash: (user, id, key, callback) => {
        let col = db.connection.collection('messages'); // init collection with user and messages id's
        let login = (user.user).toString().toLowerCase();

        if (!id) return callback({message: 'Undefined message ID, current ID is - ' + id, code: 40000}, 400);
        else if (!key) return callback({message: 'Undefined storage key, current key is - ' + key, code: 50000}, 500);

        var obj = new Object();
        obj[key] = Number(id);

        var promises = [
            new Promise(function(res, rej) {
                col.findOneAndUpdate({_id: login}, { $pull: obj }, (err, item) => {
                    if (err) { return rej(err); }
                    return res();
                })
            }),
            new Promise(function(res, rej) {
                col.findOneAndUpdate({_id: login}, { $push: { trash: Number(id) } }, (err, item) => {
                    if (err) { return rej(err); }
                    return res();
                })
            })
        ];

        Promise.all(promises).then(() => {
            callback({message: 'Message ' + id + ' deleted sucessfull', code: 20000});
        }, (err) => {
            callback(err, 500);
        });
    },
    cleanTrash: (user, callback) => {
        let login = (user.user).toString().toLowerCase();
        let col = db.connection.collection('messages'); // init collection with user and messages id's
        col.findOneAndUpdate({_id: login}, { $set: { trash: new Array() } }, (err, item) => {
            if (err) {
                return callback(err, 500);
            }

            return callback({message: 'All trash messages was removed', code: 20000});
        })
    },
    removeOneMessageFromTrash: (user, messageID, callback) => {
        let login = (user.user).toString().toLowerCase();
        if (!messageID) return callback({message: 'Undefined messageID', code: 40000}, 400);

        let col = db.connection.collection('messages');

        col.findOneAndUpdate({_id: login}, { $pull: {trash: Number(messageID)} }, (err, r) => {
            if (err) { return callback(err); }
            return callback({message: messageID + ' was removed sucessfull', code: 20000});
        })
    }
}
