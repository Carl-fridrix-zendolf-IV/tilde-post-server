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
    searchUser: (user, search, callback) => {
        let login = (user.user).toString().toLowerCase();
        let str = new RegExp('^' + search, 'i');
        let col = db.connection.collection('users');

        // Try to find in last_name, first_name and login
        col.find({$or: [
            {last_name: {$regex: str}},
            {first_name: {$regex: str}},
            {login: {$regex: str}}
        ]}, {
            _id: 0,
            login: 1,
            last_name: 1,
            first_name: 1,
            post_code: 1,
            country: 1,
            city: 1,
            address: 1,
            image: 1
        }).limit(20).toArray().then((docs) => {
            return callback({data: docs, code: 20000});
        })
    },
    getContactsList: (user, query, callback) => {
        /*
            Then you need to get contacts list init two functions with promises
            1. Find in users collection
            2. Find in addresses collection

            and join them in the end.

            DON'T FORGER ABOUT PAGINATION
        */

        let login = (user.user).toString().toLowerCase();
        let col = db.connection.collection('contacts');
        let usersCollection = db.connection.collection('users');

        let page = Number(query.page);
        let count = Number(query.count);

        if (count > 20) { return callback({message: 'Count couldn\'t be more than 20', code: 40000}, 400); }

        col.aggregate([
            { $match: { _id : login } },
            { $unwind: '$contacts' },
            { $skip: (page - 1) * count },
            { $limit: count }
        ], (err, r) => {
            if (r.length == 0) { return callback({data: r, code: 20000}); }

            var arr = new Array();
            r.forEach((item, i) => {
                arr.push(item.contacts);
            })

            usersCollection.find({
                login: {$in: arr}},
                {
                    one_time_code: 0,
                    phone_number_verified: 0,
                    phone_number: 0,
                    password: 0,
                    _id: 0,
                    one_time_code_expire_date: 0
                }
            ).toArray().then((docs) => {
                return callback({data: docs, code: 20000})
            })
        })
    },
    getContactById: (user, id, callback) => {
        let login = (user.user).toString().toLowerCase();
        let usersCollection = db.connection.collection('users');

        usersCollection.find(
            {
                login: id.toString()
            },
            {
                one_time_code: 0,
                phone_number_verified: 0,
                phone_number: 0,
                password: 0,
                _id: 0,
                one_time_code_expire_date: 0
            }
        ).limit(1).next((err, doc) => {
            if (err)
                return callback(err, 500);
            else if (!doc)
                return callback({message: 'Undefined contact', code: 40000}, 400);
            else {
                return callback({data: doc, code: 20000});
            }
        })
    },
    searchInContactsList: (user, search, callback) => {
        let login = (user.user).toString().toLowerCase();
        let col = db.connection.collection('contacts');
        let usersCollection = db.connection.collection('users');
        let str = new RegExp('^' + search, 'i');

        col.aggregate([
            { $match: { _id : login } },
            { $unwind: '$contacts' },
            { $limit: 20 }
        ], (err, r) => {
            if (r.length == 0) { return callback({data: r, code: 20000}); }

            var arr = new Array();
            r.forEach((item, i) => {
                arr.push(item.contacts);
            })

            usersCollection.find(
                {
                    login: {$in: arr},
                    $or: [
                        {last_name: {$regex: str}},
                        {first_name: {$regex: str}},
                        {login: {$regex: str}},
                        {post_code: {$regex: str}},
                        {country: {$regex: str}},
                        {city: {$regex: str}},
                        {address: {$regex: str}}
                    ]
                },
                {
                    one_time_code: 0,
                    phone_number_verified: 0,
                    phone_number: 0,
                    password: 0,
                    _id: 0,
                    one_time_code_expire_date: 0
                }
            ).toArray().then((docs) => {
                return callback({data: docs, code: 20000})
            })
        })
    },
    addContact: (user, record, callback) => {
        /*
            Then you try to add new contact you must set few steps:
            1. Check contact type - login or address

            (If it is a login) => push login to contact Array
            (If it is address) => create new user without login and phone number and with type ADDRESS
            (#FIXME in addUser method). Set unique ID in _id and than push to contacts Array - whis method maybe async
        */

        let login = (user.user).toString().toLowerCase();
        let users_col = db.connection.collection('users');
        let contacts_col = db.connection.collection('contacts');

        // if (record.contact_login && (record.contact_login == login)) {
        //     return callback({message: 'contact_login equals user login', code: 40000}, 400);
        // }

        if (record.contact_login) {
            users_col.find({login: record.contact_login}).limit(1).next((err, doc) => {
                if (err)
                    return callback(err, 500);
                else if (!doc) {
                    return callback({message: 'Can\'t find user with login ' + record.contact_login, code: 40000}, 400);
                }

                contacts_col.findOneAndUpdate({_id: login}, {$addToSet: {contacts: record.contact_login}}, {returnOriginal: false}, (err, r) => {
                    if (err)
                        return callback(err, 500);

                    callback({message: 'User ' + record.contact_login + ' sucessfully added to your contacts list', code:20000});
                })
            })
        }
        else if (!record.contact_login) {
            let record_id = Math.floor(Math.random() * (9999999 - 1000000)) + 1000000;
            record.contact_login = record_id;

            users_col.insertOne({
                login: record_id.toString(),
                post_code: record.post_code,
                country: record.country,
                city: record.city,
                address: record.address,
                last_name: record.last_name,
                first_name: record.first_name,
                custom_address: true
            }, (err, r) => {
                if (err)
                    return callback(err, 500);

                contacts_col.findOneAndUpdate({_id: login}, {$addToSet: {contacts: record_id.toString()}}, {returnOriginal: false}, (err, r) => {
                    if (err)
                        return callback(err, 500);

                    return callback({message: 'Custom address added sucessfully to user contacts list', addressId: record_id, code: 20000});
                })
            })
        }
    },
    editContact: (user, update, callback) => {
        let users_col = db.connection.collection('users');
        let login = (user.user).toString().toLowerCase();

        if (isNaN(update.contact)) {
            return callback({message: 'You can\'t edit user account', code: 40000}, 400);
        }

        var data = new Object();
        if (update.post_code) {
            data.post_code = update.post_code;
        }
        if (update.country) {
            data.country = update.country;
        }
        if (update.city) {
            data.city = update.city;
        }
        if (update.address) {
            data.address = update.address;
        }
        if (update.first_name) {
            data.first_name = update.first_name;
        }
        if (update.last_name) {
            data.last_name = update.last_name;
        }

        users_col.updateOne({login: update.contact.toString()}, {$set: data}, {}, (err, r) => {
            if (err)
                return callback(err, 500);

            return callback({message: 'Custom address updated sucessfull', code: 20000});
        })
    },
    removeContact: (user, contact, callback) => {
        /*
            Then you try to remove a contact from contacts list
            1. Check contact type - login or address

            (if it is login) => pull this login from Array
            (if it is address) => pull id of this address from Array and remove this contact from users list by ID
        */

        let col = db.connection.collection('contacts');
        let users_col = db.connection.collection('users');
        let login = (user.user).toString().toLowerCase();

        col.updateOne({_id: login}, { $pull: { contacts: contact.toString() }}, (err, item) => {
            if (err) callback(err, 500);
            callback({message: 'Record with ID ' + contact + ' removed sucessfully from contacts list', code: 20000});

            if (!isNaN(contact)) {
                users_col.findOneAndDelete({login: contact}, {}, (error, r) => {})
            }
        })
    }
}
