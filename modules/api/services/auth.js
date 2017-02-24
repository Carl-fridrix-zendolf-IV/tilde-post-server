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
    phoneVerify: (number, callback) => {
        let code = Math.floor(Math.random() * (9999 - 1000)) + 1000;
        let col = db.connection.collection('users');

        let updateUser = () => {
            col.findOneAndUpdate({phone_number: number.toString()}, {$set: {one_time_code: code, one_time_code_expire_date: (new Date().getTime() + 120000)}}, {}, (err, r) => {
                if (err)
                    return callback(err, 500);

                callback({message: 'SMS send to +' + number, code: 20000});
            })
        }

        col.find({phone_number: number.toString()}).toArray().then((docs) => {
            if (docs.length == 0) {
                return callback({message: 'Can not find user with +' + number + ' phone number' , code: 40000}, 400);
            }
            else {
                twillio.messages.create({
                    to: "+" + number,
                    from: "+32460207026",
                    body: "Your code is " + code + '. From Tilda, with Love :)'
                }, function(err, message) {
                    if (err) { return callback(err, 500); }
                    else if (message) {
                        updateUser();
                    }
                });
            }
        })
    },
    codeVerify: (data, callback) => {
        let col = db.connection.collection('users');
        col.find({phone_number: data.phone.toString()}).toArray().then((docs) => {
            if (docs.length == 0) {
                return callback({message: 'Can not find user with +' + data.phone + ' phone number' , code: 40000}, 400);
            }

            if (docs[0].one_time_code != data.code) {
                return callback({message: 'Wrong code - ' + data.code, code: 40000}, 400);
            }
            else if (new Date().getTime() > Number(docs[0].one_time_code_expire_date)) {
                return callback({message: 'Code available time expired', code: 40000}, 400);
            }
            else {
                col.findOneAndUpdate({phone_number: data.phone.toString()}, {$set: {phone_number_verified: true, one_time_code: null}}, {}, (err, r) => {
                    if (err) {
                        return callback(err, 500);
                    }

                    callback({message: 'Phone number verify successfull', code: 20000});
                })
            }
        })
    },
    checkLoginAvailable: (login, callback) => {
        var _login = (login).toString().toLowerCase();
        var usersCollection = db.connection.collection('users');

        usersCollection.find({login: _login}).toArray((err, docs) => {
            if (docs.length == 0) {
                return callback({message: login + ' is available', code: 20000});
            }
            else {
                return callback({message: login + ' is unavailable', code: 40009}, 400);
            }
        })
    },
    addUser: (user, callback) => {
        if (!user) return callback({message: 'User data is undefined', code: 40000}, 400);
        else if (!user.addresses[0].type) { user.addresses[0].type = 'HOME'; };

        user.addresses.map((item, i) => {
            return item.visibility = true;
        })

        // Add a user to the database
        var login = (user.login).toString().toLowerCase();
        var id = (login + '.' + new Date().getTime()).toString();
        var password = user.password;
        var usersCollection = db.connection.collection('users');
        let code = Math.floor(Math.random() * (9999 - 1000)) + 1000;

        var createRecords = (user_id) => {
            var promises = [
                new Promise(function(res, rej) {
                    let col = db.connection.collection('contacts');
                    col.insertOne({_id: login, contacts: []}, function(err, r) {
                        if (err) {
                            console.log(err, '[' + new Date() + ']')
                            return rej();
                        }

                        res();
                    })
                }),
                new Promise(function(res, rej) {
                    let col = db.connection.collection('messages');
                    col.insertOne({_id: login, inbox: [], outbox: [], trash: []}, function(err, r) {
                        if (err) {
                            console.log(err, '[' + new Date() + ']')
                            return rej();
                        }

                        res();
                    })
                }),
                new Promise(function(res, rej) {
                    let col = db.connection.collection('bills');
                    col.insertOne({_id: login, balance: 100, history: []}, function(err, r) {
                        // balance: 100 - it's default user balance
                        if (err) {
                            console.log(err, '[' + new Date() + ']')
                            return rej();
                        }

                        res();
                    })
                })
            ]

            Promise.all(promises).then(function () {
                twillio.messages.create({
                    to: "+" + user.phone_number,
                    from: "+32460207026",
                    body: "Your code is " + code + '. From Tilda, with Love :)'
                }, function(err, message) {
                    if (err) { return callback(err, 500); }
                    else if (message) {
                        callback({message: 'User ' + user.login + ' was created sucessfully', code: 20000})
                    }
                });
            }, function () {
                callback({message: 'database record error', code: 50000}, 500);
            })
        }
        var updatePasswordToHash = (user_id) => {
            bcrypt.hash(user.password, saltRounds, function(err, hash) {
                usersCollection.findOneAndUpdate({_id: user_id}, {$set: {password: hash}}, {}, (err, r) => {
                    if (err) return updatePasswordToHash(user_id);
                })
            });
        }

        usersCollection.createIndex({login: 1}, {unique:true}, function(err, indexName) {
            usersCollection.distinct('phone_number', {phone_number_verified: true}, (err, docs) => {
                for (var i = 0; i < docs.length; i++) {
                    let item = docs[i];
                    if (item == user.phone_number) {
                        return callback({message: 'Storage have user with same phone number, please enter other phone', code: 40000}, 400);
                    }
                }
                client.phoneNumbers('+' + user.phone_number).get((error, number) => {
                    if (error && error.status == 404) {
                        return callback({message: 'Invalid phone number. +' + user.phone_number, code: 40000});
                    }
                    else if (error) {
                        return callback(error, 500);
                    }
                    else if (!error) {

                        // If this user is not exist and have valid phone number
                        usersCollection.insertOne({
                            _id: id,
                            login: login,
                            password: user.password,
                            first_name: user.first_name,
                            last_name: user.last_name,
                            birthday: user.birthday,
                            addresses: user.addresses,
                            phone_number: user.phone_number,
                            phone_number_verified: false,
                            one_time_code: code,
                            one_time_code_expire_date: (new Date().getTime() + 120000),
                            image: user.image || null,
                            custom_address: false
                        }, (err, r) => {
                            if (err && err.code == 11000) {
                                return callback({message: "User with login \"" + login + '\" already exist.', code: 40009}, 400);
                            }
                            else if (err) return callback(err, 500);

                            createRecords(id);
                            updatePasswordToHash(id);
                        })
                    }
                })
            })
        })
    },
    authenticate: (user, callback) => {

        var usersCollection = db.connection.collection('users');
        var login = (user.login).toString().toLowerCase();

        // usersCollection.find({ login: login }).toArray().then((docs) => {
        usersCollection.find({login: login}).limit(1).next((err, doc) => {
            // If user is not exist in DB
            if (!doc) {
                return callback({message: 'Can\'t find ' + user.login + ' in database', code: 40001}, 401);
            }

            var checkPass = bcrypt.compareSync(user.password, doc.password);

            // If password is incorrect
            if ((checkPass || (user.password == doc.password)) && !doc.phone_number_verified) {
                return callback({ message: user.login + ' have unverified phone number', code: 40001, phone: doc.phone_number });
            }
            else if (checkPass || (user.password == doc.password)) {
                var token = jwt.sign({ user: user.login, id: doc._id }, global.JWT, {expiresIn: '12h'});
                return callback({ message: user.login + ' authenticated sucessfull', token: token, code: 20000 });
            }
            else if (!checkPass) {
                return callback({message: 'Incorrect password', code: 40001}, 401)
            }
        })
    },
    forgotPassword: (user, callback) => {
        var usersCollection = db.connection.collection('users');
        var phone = user.phone.toString();

        let randomString = (length, chars) => {
            var result = '';
            for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
            return result;
        }

        var password = randomString(8, '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');

        usersCollection.findOneAndUpdate({phone_number: phone}, {$set: {password: bcrypt.hashSync(password, saltRounds)}}, {}, (err, r) => {
            if (err) return callback(err, 500);
            else if (r.value == null) {
                return callback({message: '+' + phone + ' is not exist', code: 40000}, 400);
            }
            else {
                twillio.messages.create({
                    to: "+" + phone,
                    from: "+32460207026",
                    body: 'Your new password is ' + password + '. From Tilda, with Love :)'
                }, function(err, message) {
                    if (err) { return callback(err, 500); }
                    else if (message) {
                        return callback({ message: 'Password changed sucessfully. Your new password has send on your phone +' + phone, code: 20000 });
                    }
                });
            }
        })
    },
    changePassword: (user, queires, callback) => {
        var usersCollection = db.connection.collection('users');
        var login = (user.user).toString().toLowerCase();

        if (queires.password.length < 6) {
            return callback({message: 'Password length couldn be less than 6 symbols'});
        }

        var password = bcrypt.hashSync(queires.password, saltRounds);

        usersCollection.findOneAndUpdate({login: login}, {$set: {password: password}}, {}, (err, r) => {
            if (err) return callback(err, 500);
            else if (r.value == null) {
                return callback({message: user.login + ' is not exist', code: 40000}, 400);
            }
            else {
                return callback({ message: 'Password changed sucessfully. Please authenticate again.', code: 20000 });
            }
        })
    }
}
