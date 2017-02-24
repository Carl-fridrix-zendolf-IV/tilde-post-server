'use strict'

const smtp = require('./modules/smtp/controller.js')();
const API = require('./modules/api/route.js')();
const fs = require('fs');

// Startup MongoClient
const MongoClient = require('mongodb').MongoClient;

const MONGODB_URI = 'mongodb://root:882Bee0xeF@waffle.modulusmongo.net:27017/ibaq2ugI'; // modulus

console.log(new Date());

// connection to Mongo DB
MongoClient.connect(MONGODB_URI, (err, db) => {
    if (err) {
        console.log('ERROR when try to connect to MongoDB', err, MONGODB_URI, '[' + new Date() + ']');
    }

    console.log('Sucessfull connection to MongoBD', MONGODB_URI, '[' + new Date() + ']');
    return exports.connection = db;
})

// Every hour check pdf_messages folder and remove messages which time is expired
setInterval(() => {
    var dir = fs.readdirSync('./pdf_messages');
    for (var i = 0; i < dir.length; i++) {
        var time = dir[i].split('_')[2];

        if (new Date().getTime() > Number(time)) {
            fs.unlink(dir[i], (err, r) => {
                if (err) {
                    console.log('PDF not removed!', dir[i]);
                }
            })
        }
    }
}, 3600000);


// ***** GLOBAL VARIABLES *****
global.JWT = 'awesome_';
