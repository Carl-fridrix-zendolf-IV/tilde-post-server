'use strict'
var db = require('../../../index');
const fs = require('fs');
const jwt = require('jsonwebtoken'); // JSON Web Token
const pdf = require('html-pdf'); // HTML to PDF convert module
const pdfConverterOptions = { format: 'Letter' }; // HTML to PDF options

// Twilio Credentials
const accountSid = 'AC286caff20a057660b9742ab13ebead26';
const authToken = 'ae430f6b7336035650f6a667658955c2';

//require the Twilio module and create a REST client
const twillio = require('twilio')(accountSid, authToken);
const LookupsClient = require('twilio').LookupsClient;
const client = new LookupsClient(accountSid, authToken);

// For passwords hashing
const bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = {
    getUserInfo: (user, callback) => {

        var usersCollection = db.connection.collection('users');
        var login = (user.user).toString().toLowerCase();

        usersCollection.find({login: login}, {
            one_time_code: 0,
            phone_number_verified: 0,
            password: 0,
            _id: 0,
            one_time_code_expire_date: 0
        }).limit(1).next((err, doc) => {
            if (!doc) return callback({data: new Object(), message: 'Undefined user', code: 40000}, 400);
            return callback({data: doc, code: 20000});
        })
    },
    updateUserInfo: (user, fields, callback) => {
        var usersCollection = db.connection.collection('users');
        var login = (user.user).toString().toLowerCase();

        delete fields.login;
        delete fields.password;

        usersCollection.find({login: login}).limit(1).next((err, doc) => {
            if (err) {
                return callback(err, 500);
            }
            else if (!doc) { return callback({message: 'Undefined user', data: null, code: 40000}, 400); }

            let data = doc;

            if ('phone_number' in fields) {
                var phone = fields.phone_number.replace(/\+/g, '');
                fields.phone_number = phone.replace(/ /g,"");

                client.phoneNumbers('+' + fields.phone_number).get((error, number) => {
                    if (error && error.status == 404) {
                        return callback({message: 'Invalid phone number. +' + fields.phone_number});
                    }
                    else if (error) { return callback(error, 500); }
                    else if (!error) {
                        fields.phone_number_verified = false; // set phone as unverified
                        updateUser(data);
                    }
                })
            }
            else {
                updateUser(data);
            }
        })

        var updateUser = (data) => {
            if (fields.addresses && fields.addresses.length > 0) {
                fields.addresses.forEach((item, index) => {
                    for (let i in item) {
                        if (!data.addresses[index]) {
                            data.addresses[index] = {
                                "post_code": null,
                                "country": null,
                                "city": null,
                                "address": null,
                                "type": "OTHER",
                                "visibility": true
                            };
                            data.addresses[index][i] = item[i];
                        }
                        else if (data.addresses[index].hasOwnProperty(i)) {
                            data.addresses[index][i] = item[i];
                        }
                    }
                })
            }

            for (var i in fields) {
                if (i == 'addresses') { continue; }
                else if (data.hasOwnProperty(i)) {
                    data[i] = fields[i];
                }
            }

            usersCollection.findOneAndUpdate({login: login}, data, {returnOriginal: false}, (err, r) => {
                if (err) return callback(err, 500);

                delete r.value.password;
                delete r.value._id;
                delete r.value.one_time_code;
                delete r.value.one_time_code_expire_date;
                delete r.value.phone_number_verified;

                return callback({message: 'User data updated sucessfully', data: r.value, code: 20000});
            })
        }
    },
    removeUserImage: (user, callback) => {
        var usersCollection = db.connection.collection('users');
        var login = (user.user).toString().toLowerCase();

        usersCollection.find({ login: login }).toArray().then((docs) => {
            var imagePath = docs[0].image.split('/');

            fs.unlink('./images/' + imagePath.pop(), (err, r) => {});

            usersCollection.findOneAndUpdate({ login: login }, {$set: { image:null }}, {returnOriginal: false}, (err, r) => {
                if (err) {
                    return callback(err);
                }

                delete r.value.login;
                delete r.value.password;
                delete r.value._id;

                return callback({data: r.value, code: 20000});
            })
        })
    }
}
