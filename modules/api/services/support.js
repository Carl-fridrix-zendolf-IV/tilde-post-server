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
    createSupportMessage: (data, callback) => {
        var requestId = Math.floor(Math.random() * (99999999 - 10000000)) + 10000000;

        let col = db.connection.collection('support_requests');
        col.insertOne({
            _id: requestId,
            contact_email: data.contact_email,
            message: data.message,
            date: new Date(),
            login: data.login || null
        }, function(err, r) {
            if (err) {
                return callback(err, 500);
            }

            callback({message: 'Support request created sucessfull', requestId: requestId, code: 20000});
        })
    },
    dropCollections: (callback) => {
        let promises = new Array();
        let users = db.connection.collection('users');

        promises = [
            new Promise((resolve, reject) => {
                db.connection.dropCollection("users", function(err, result) {
                    if (err)
                        return reject(err)

                    resolve();
                })
            }),
            new Promise((resolve, reject) => {
                db.connection.dropCollection("bills", function(err, result) {
                    if (err)
                        return reject(err)

                    resolve();
                })
            }),
            new Promise((resolve, reject) => {
                db.connection.dropCollection("contacts", function(err, result) {
                    if (err)
                        return reject(err)

                    resolve();
                })
            }),
            new Promise((resolve, reject) => {
                db.connection.dropCollection("messages", function(err, result) {
                    if (err)
                        return reject(err)

                    resolve();
                })
            })
        ]

        Promise.all(promises).then(() => {
            return callback({messages: 'All collections droped successfull', code: 20000});
        }, (err) => {
            console.log(err);
            return callback({messages: 'Something went wrong :(', err: err, code: 20000}, 500);
        })
    }
}
